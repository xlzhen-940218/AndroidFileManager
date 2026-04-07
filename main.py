# app.py
import logging
from flask import Flask, render_template, request, jsonify, Response, make_response, send_file
import subprocess
import re
from functools import wraps
from pathlib import Path
from datetime import datetime
import mimetypes
import os
from install_tools import install_adb, install_ffmpeg, verify_installation, install_all

# 常量定义
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STORAGE_DIR = os.path.join(BASE_DIR, 'storage')
PER_PAGE = 64
ADB_TIMEOUT = 3000 # ADB命令超时时间，单位为秒 考虑到大视频传输问题
LS_OUTPUT_REGEX = re.compile(
    r'^([d-])([rwxst-]{9})\s+(\d+)\s+(\S+)\s+(\S+)\s+(\d+\.?\d*[KMG]?)\s+(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})\s+(.+)$'
)
LS_OUTPUT_ALT_REGEX = re.compile(
    r'^([d-])([rwxst-]{9})\s+(\d+)\s+(\S+)\s+(\S+)\s+(\s*\d+\.?\d*[KMG]?)\s+(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})\s+(.+)$'
)
IMAGE_REGEX = re.compile(
    r"Row: \d+ _id=(?P<_id>[^,]+),\s+"
    r"_data=(?P<_data>[^,]+),\s+"
    r"mime_type=(?P<mime_type>[^,]+),\s+"
    r"_size=(?P<_size>[^,]+),\s+"
    r"_display_name=(?P<_display_name>[^,]+),\s+"
    r"width=(?P<width>[^,]+),\s+"
    r"height=(?P<height>[^,]+),\s+"
    r"date_added=(?P<date_added>[^,]+)"
)
AUDIO_REGEX = re.compile(
    r"Row: \d+ _id=(?P<_id>[^,]+),\s+"
    r"_data=(?P<_data>[^,]+),\s+"
    r"mime_type=(?P<mime_type>[^,]+),\s+"
    r"_size=(?P<_size>[^,]+),\s+"
    r"_display_name=(?P<_display_name>[^,]+),\s+"
    r"date_added=(?P<date_added>[^,]+)"
)
MIME_TYPES = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.txt': 'text/plain',
    '.log': 'text/plain',
}
MEDIA_URIS = {
    'image': 'content://media/external/images/media',
    'video': 'content://media/external/video/media',
    'audio': 'content://media/external/audio/media',
    'file': 'content://media/external/file'
}
MEDIA_PROJECTIONS = {
    'image': '_id:_data:mime_type:_size:_display_name:width:height:date_added',
    'video': '_id:_data:mime_type:_size:_display_name:width:height:date_added',
    'audio': '_id:_data:mime_type:_size:_display_name:date_added'
}

# 初始化Flask应用
app = Flask(__name__)

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def parse_ls_output(ls_text, dir_path: str):
    """解析ls命令输出为结构化数据"""
    result = []
    dir_path = dir_path.rstrip('/') + '/'
    
    for line in ls_text.strip().split('\n'):
        match = LS_OUTPUT_REGEX.match(line) or LS_OUTPUT_ALT_REGEX.match(line)
        if not match:
            continue
        
        # 提取匹配组
        entry_type, permissions, links, owner, group, size_str, date_str, time_str, name = match.groups()
        size_str = size_str.strip()
        
        # 转换文件大小
        size_val = float(re.search(r'[\d.]+', size_str).group(0))
        multipliers = {'K': 1024, 'M': 1024**2, 'G': 1024**3}
        multiplier = next((v for k, v in multipliers.items() if k in size_str.upper()), 1)
        size = int(size_val * multiplier)
        
        # 转换日期时间
        try:
            dt = datetime.strptime(f"{date_str} {time_str}", "%Y-%m-%d %H:%M")
            timestamp = str(int(dt.timestamp()))
        except ValueError:
            timestamp = "0"
        
        # 确定MIME类型
        mime_type = 'inode/directory' if entry_type == 'd' else mimetypes.guess_type(name)[0] or 'application/octet-stream'
        
        # 构建结果对象
        result.append({
            "_data": dir_path + name,
            "_display_name": name,
            "_size": size,
            "date_added": timestamp,
            "mime_type": mime_type,
            "path": dir_path
        })
    
    return result

def generate_thumbnail(media_path: str) -> str:
    """为媒体文件生成缩略图"""
    cache_dir = Path.cwd() / ".cache_thumbnail"
    cache_dir.mkdir(exist_ok=True, parents=True)
    
    media_file = Path(media_path)
    thumb_path = cache_dir / f"{media_file.stem}_thumb.jpg"
    
    if thumb_path.exists():
        return str(thumb_path)
    
    try:
        subprocess.run([
            'ffmpeg', '-i', media_path,
            '-vf', 'scale=960:960:force_original_aspect_ratio=decrease',
            '-vframes', '1', '-y', '-loglevel', 'error', str(thumb_path)
        ], check=True)
        return str(thumb_path)
    except (subprocess.CalledProcessError, FileNotFoundError, Exception) as e:
        logger.error(f"缩略图生成失败: {e}")
        return ""

def ensure_directory(path):
    """确保目录存在"""
    os.makedirs(path, exist_ok=True)
    logger.info(f"确保目录存在: {path}")

def device_id_required(func):
    """装饰器：验证设备ID"""
    @wraps(func)
    def wrapper(*args, **kwargs):
        device_id = request.args.get('id') or request.json.get('id')
        if not device_id:
            logger.warning("缺少设备ID参数")
            return jsonify({'error': 'Missing device ID'}), 400
        return func(*args, device_id=device_id, **kwargs)
    return wrapper

def run_adb_command(command, device_id=None, timeout=ADB_TIMEOUT, capture_output=True):
    """执行ADB命令的通用函数"""
    base_cmd = ['adb']
    if device_id:
        base_cmd.extend(['-s', device_id])
    
    full_cmd = base_cmd + (command.split() if isinstance(command, str) else command)
    logger.info(f"执行ADB命令: {' '.join(full_cmd)}")
    
    try:
        return subprocess.run(
            full_cmd,
            capture_output=capture_output,
            text=True,
            timeout=timeout,
            check=True,
            encoding='utf-8',
            errors='ignore'
        )
    except subprocess.CalledProcessError as e:
        logger.error(f"ADB命令执行失败: {e.stderr}")
        raise RuntimeError(f"ADB命令失败: {e.stderr}") from e
    except subprocess.TimeoutExpired as e:
        logger.error(f"ADB命令超时: {e}")
        raise RuntimeError("ADB命令超时") from e

def pull_file_from_device(device_id, remote_path, local_path):
    """从设备拉取文件到本地"""
    try:
        result = run_adb_command(['pull', remote_path, local_path], device_id)
        logger.info(f"文件拉取成功: {remote_path} -> {local_path}")
        return True, result.stdout
    except Exception as e:
        error_msg = f"文件拉取失败: {str(e)}"
        logger.error(error_msg)
        return False, error_msg

def parse_adb_output(output, media_type='image'):
    """解析adb命令输出的文本"""
    result = []
    regex = IMAGE_REGEX if media_type in ('image', 'video') else AUDIO_REGEX
    
    for line in output.splitlines():
        match = regex.match(line)
        if not match:
            continue
        
        try:
            item = match.groupdict()
            # 转换数值类型字段
            # int_fields = ['_id', '_size'] + (['width', 'height'] if media_type in ('image', 'video') else [])
            # for key in int_fields:
            #     if key in item:
            #         item[key] = int(item[key])
            
            # 处理显示名称
            if item['_display_name'] == 'NULL':
                item['_display_name'] = item['_data'].split('/')[-1]
            
            # 添加路径信息
            item['path'] = item['_data'][:item['_data'].rfind('/') + 1]
            result.append(item)
        except (ValueError, TypeError) as e:
            logger.warning(f"解析行失败: {line} - {str(e)}")
    
    logger.info(f"成功解析 {len(result)} 个条目")
    return result

def get_mime_type(filename):
    """根据文件扩展名获取MIME类型"""
    _, ext = os.path.splitext(filename)
    return MIME_TYPES.get(ext.lower(), 'application/octet-stream')

def download_or_get_local(device_id, category, file_path, file_name):
    """下载文件或获取本地缓存路径"""
    target_dir = os.path.join(STORAGE_DIR, device_id, category)
    ensure_directory(target_dir)
    
    local_file = os.path.join(target_dir, file_name)
    
    if not os.path.exists(local_file):
        success, message = pull_file_from_device(device_id, file_path, local_file)
        if not success or not os.path.exists(local_file):
            return None, message
    
    return local_file, ""

def get_media_list(device_id, media_type):
    """通用媒体获取函数"""
    if media_type not in MEDIA_URIS:
        raise ValueError(f"不支持的媒体类型: {media_type}")
    
    adb_command = [
        'shell', 'content', 'query',
        '--uri', MEDIA_URIS[media_type],
        '--projection', MEDIA_PROJECTIONS.get(media_type, MEDIA_PROJECTIONS['audio'])
    ]
    
    result = run_adb_command(adb_command, device_id)
    return parse_adb_output(result.stdout, media_type)

def handle_api_errors(func):
    """API错误处理装饰器"""
    @wraps(func)
    def wrapper(*args, **kwargs):
        try:
            return func(*args, **kwargs)
        except RuntimeError as e:
            logger.error(f"ADB命令执行失败: {str(e)}")
            return jsonify({"error": "ADB命令执行失败", "details": str(e)}), 500
        except Exception as e:
            logger.exception(f"{func.__name__} 发生意外错误")
            return jsonify({"error": "服务器内部错误", "details": str(e)}), 500
    return wrapper

# 路由定义
@app.route('/')
def wait_connect():
    return render_template('device_connect.html')

@app.route('/index.html')
def home():
    return render_template('index.html')

@app.route('/api/storagedir')
def get_storage_dir():
    """API: 获取存储目录"""
    return jsonify({'storage_dir': STORAGE_DIR})

@app.route('/api/delete_file')
@device_id_required
def delete_files(device_id):
    data = request.args.get('data')
    if not data:
        return {'error': 'Missing file'}, 400

    # 在这里处理删除文件的逻辑
    logger.info(f"Deleting file: {data} from device: {device_id}")
    # 调用ADB命令删除文件
    adb_command = ['shell', 'rm', f'"{data}"']
    run_adb_command(adb_command, device_id)

    return {'message': 'Files deleted successfully'}, 200

@app.route('/api/rename_file')
@device_id_required
def rename_file(device_id):
    """重命名文件API"""
    old_path = request.args.get('old_path')
    new_name = request.args.get('new_name')
    
    if not old_path or not new_name:
        return {'error': 'Missing old_path or new_name'}, 400
    
    # 获取文件所在目录和旧文件名
    import os
    dir_path = os.path.dirname(old_path)
    if not dir_path:
        return {'error': 'Invalid file path'}, 400
    
    # 构建新路径
    new_path = dir_path + '/' + new_name
    
    logger.info(f"Renaming file: {old_path} to {new_path} on device: {device_id}")
    
    # 调用ADB命令重命名文件
    # 注意：ADB shell中的mv命令需要使用引号包裹路径
    adb_command = ['shell', 'mv', f'"{old_path}"', f'"{new_path}"']
    try:
        run_adb_command(adb_command, device_id)
        return {'message': 'File renamed successfully', 'new_path': new_path}, 200
    except Exception as e:
        logger.error(f"重命名文件失败: {str(e)}")
        return {'error': f'Failed to rename file: {str(e)}'}, 500

@app.route('/api/upload', methods=['POST'])
@device_id_required
def upload_file(device_id):
    category = request.args.get('category')

    if not category:
        return {'error': 'Missing category'}, 400

    if 'file' not in request.files:
        return {'error': 'No file part'}, 400

    file = request.files['file']
    if file.filename == '':
        return {'error': 'No selected file'}, 400

    if file:
        if os.path.exists('uploads') is False:
            os.makedirs('uploads')
        if not os.path.exists(os.path.join('uploads', category)):
            os.makedirs(os.path.join('uploads', category))
        filepath = os.path.join('uploads', category, file.filename)
        # Here, the actual file writing happens.
        # For simplicity, we just save the file directly.
        # The progress will be handled by XMLHttpRequest on the client-side.
        file.save(filepath)
        phone_path = f'/sdcard/PC/{category}/{file.filename}'
        phone_dir = f'/sdcard/PC/{category}/'
        adb_command = [
            'push', f'{os.path.abspath(filepath)}', phone_path
        ]
    
        result = run_adb_command(adb_command, device_id)
        return {'message': 'File uploaded successfully', 'filename': file.filename, 'phonedir': phone_dir}, 200


@app.route('/api/file', methods=['GET'])
@device_id_required
@handle_api_errors
def get_file(device_id):
    """API: 获取设备文件（下载）"""
    file_path = request.args.get('file_path')
    category = request.args.get('category')
    file_name = request.args.get('file_name')
    
    if not all([file_path, category, file_name]):
        return jsonify({'error': 'Missing required parameters'}), 400
    
    local_file, error = download_or_get_local(device_id, category, file_path, file_name)
    if not local_file:
        return jsonify({'error': 'File transfer failed', 'details': error}), 500
    
    try:
        return send_file(local_file, as_attachment=True)
    except Exception as e:
        logger.error(f"发送文件失败: {str(e)}")
        return jsonify({'error': f'Failed to send file: {str(e)}'}), 500

@app.route('/api/preview', methods=['GET'])
@device_id_required
@handle_api_errors
def preview_file(device_id):
    """API: 预览文件（用于内联显示）"""
    file_path = request.args.get('file_path')
    category = request.args.get('category')
    file_name = request.args.get('file_name')
    
    if not all([file_path, category, file_name]):
        return jsonify({'error': 'Missing required parameters'}), 400
    
    local_file, error = download_or_get_local(device_id, category, file_path, file_name)
    if not local_file:
        return jsonify({'error': 'File transfer failed', 'details': error}), 500
    
    try:
        # 获取文件的MIME类型
        import mimetypes
        mime_type, _ = mimetypes.guess_type(file_name)
        if not mime_type:
            mime_type = 'application/octet-stream'
        
        response = send_file(local_file)
        # 设置Content-Disposition为inline，让浏览器尝试显示而不是下载
        # 使用URL编码处理中文文件名，避免编码错误
        import urllib.parse
        encoded_filename = urllib.parse.quote(file_name, safe='')
        # RFC 5987规范：使用UTF-8编码文件名
        content_disposition = f'inline; filename="{encoded_filename}"; filename*=UTF-8\'\'{encoded_filename}'
        response.headers['Content-Disposition'] = content_disposition
        response.headers['Content-Type'] = mime_type
        # 允许跨域加载资源（对于iframe预览很重要）
        response.headers['Access-Control-Allow-Origin'] = '*'
        return response
    except Exception as e:
        logger.error(f"预览文件失败: {str(e)}")
        return jsonify({'error': f'Failed to preview file: {str(e)}'}), 500

@app.route('/api/thumbnail', methods=['GET'])
@device_id_required
@handle_api_errors
def get_thumbnail(device_id):
    """API: 获取设备文件缩略图"""
    file_path = request.args.get('file_path')
    category = request.args.get('category')
    file_name = request.args.get('file_name')
    
    if not all([file_path, category, file_name]):
        return jsonify({'error': 'Missing required parameters'}), 400
    
    local_file, error = download_or_get_local(device_id, category, file_path, file_name)
    if not local_file:
        return jsonify({'error': 'File transfer failed', 'details': error}), 500
    
    try:
        thumb_path = generate_thumbnail(local_file)
        if not thumb_path:
            return jsonify({'error': 'Thumbnail generation failed'}), 500
            
        response = make_response(send_file(thumb_path, mimetype='image/jpeg'))
        response.headers['Cache-Control'] = 'public, max-age=86400'
        return response
    except Exception as e:
        logger.error(f"发送缩略图失败: {str(e)}")
        return jsonify({'error': f'Failed to send thumbnail: {str(e)}'}), 500

@app.route('/api/get_images', methods=['GET'])
@device_id_required
@handle_api_errors
def get_images(device_id):
    """API: 获取设备图像列表"""
    return jsonify(get_media_list(device_id, 'image'))

@app.route('/api/get_videos', methods=['GET'])
@device_id_required
@handle_api_errors
def get_videos(device_id):
    """API: 获取设备视频列表"""
    return jsonify(get_media_list(device_id, 'video'))

@app.route('/api/get_audios', methods=['GET'])
@device_id_required
@handle_api_errors
def get_audios(device_id):
    """API: 获取设备音频列表"""
    return jsonify(get_media_list(device_id, 'audio'))

@app.route('/api/get_documents', methods=['GET'])
@device_id_required
@handle_api_errors
def get_documents(device_id):
    """API: 获取设备文档列表"""
    document_type = request.args.get('document_type', 'document')
    suffix_map = {
        'document': r"'\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|odt|ods|odp)'",
        'zip': r"'\.(zip|rar|7z|tar|gz)'",
        'apk': r"'\.(apk)'"
    }
    
    if document_type not in suffix_map:
        return jsonify({'error': 'Invalid document type'}), 400
    
    adb_command = [
        'shell', f"content query --uri {MEDIA_URIS['file']} --projection {MEDIA_PROJECTIONS['audio']} | grep -E {suffix_map[document_type]}"
    ]
    
    result = run_adb_command(adb_command, device_id)
    document_data = parse_adb_output(result.stdout, media_type='document')
    return jsonify(document_data)

@app.route('/api/get_files', methods=['GET'])
@device_id_required
@handle_api_errors
def get_files(device_id):
    """API: 获取设备文件列表"""
    path = request.args.get('path', '/sdcard/').rstrip('/') + '/'
    adb_command = ['shell', "ls", "-lh", f"'{path}'"]
    
    result = run_adb_command(adb_command, device_id)
    files_data = parse_ls_output(result.stdout, dir_path=path)
    return jsonify(files_data)

@app.route('/screenshot/<device_id>')
@handle_api_errors
def get_screenshot(device_id):
    """获取设备截图"""
    command = f"adb -s {device_id} exec-out screencap -p"
    result = subprocess.run(
        command.split(),
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=10
    )
    return Response(result.stdout, mimetype='image/png')

def get_device_name(device_id):
    """获取设备名称"""
    result = run_adb_command('shell getprop ro.product.model', device_id)
    return result.stdout.strip()

def get_storage_info(device_id):
    """获取存储空间信息"""
    result = run_adb_command('shell df /data', device_id)
    lines = result.stdout.strip().splitlines()
    
    if len(lines) < 2:
        raise ValueError("存储信息格式错误")
    
    parts = lines[-1].split()
    if len(parts) < 5:
        raise ValueError("存储信息格式错误")
    
    # 转换为GB
    total_kb = int(parts[1])
    used_kb = int(parts[2])
    total_gb = round(total_kb / (1024 * 1024), 2)
    used_gb = round(used_kb / (1024 * 1024), 2)
    
    return {"total": total_gb, "used": used_gb}

def get_battery_level(device_id):
    """获取电池电量百分比"""
    result = run_adb_command('shell dumpsys battery', device_id)
    match = re.search(r'level:\s*(\d+)', result.stdout)
    return int(match.group(1)) if match else 0

@app.route('/api/device_info', methods=['POST'])
@device_id_required
@handle_api_errors
def get_device_info(device_id):
    """API: 获取设备信息"""
    device_name = get_device_name(device_id)
    storage_info = get_storage_info(device_id)
    battery_level = get_battery_level(device_id)
    
    return jsonify({
        'cover_img': f'/screenshot/{device_id}',
        'phone_name': device_name,
        'storage_total_size': storage_info["total"],
        'storage_use_size': storage_info["used"],
        'battery_use': battery_level
    })

def get_adb_devices():
    """获取已连接的ADB设备列表"""
    try:
        result = run_adb_command('devices', timeout=10)
        devices = [
            parts[0] for line in result.stdout.splitlines()[1:]
            if (parts := line.split()) and len(parts) >= 2 and parts[1] == 'device'
        ]
        return {'connected': bool(devices), 'devices': devices}
    except Exception:
        return {'connected': False, 'devices': []}

@app.route('/api/get_device', methods=['GET'])
@handle_api_errors
def device_status():
    """API: 获取设备连接状态"""
    return jsonify(get_adb_devices())

if __name__ == '__main__':
    # 验证和安装必要工具
    for tool, installer in [('adb', install_adb), ('ffmpeg', install_ffmpeg)]:
        success, info = verify_installation(tool)
        logger.info(f"{tool}验证结果: {success}, 信息: {info}")
        if not success:
            success, message = installer()
            logger.info(f"{tool}安装结果: {success}, 信息: {message}")

    ensure_directory(STORAGE_DIR)
    logger.info("应用启动，存储目录: %s", STORAGE_DIR)
    app.run(debug=True, host='0.0.0.0', port=5001)