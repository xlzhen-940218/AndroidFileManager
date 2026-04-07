// script.js
// 全局变量
const params = new URLSearchParams(window.location.search);
const serial_id = params.get('id') || 'default';

var filesData = [];
// 每页显示的文件数
const itemsPerPage = 32;
let currentPage = 1;
let currentView = 'grid';
let filteredFiles = [...filesData];
let currentPreviewFile = null;
let currentPath = ''; // 当前路径
let pathHistory = []; // 路径历史
let selectedFiles = [];
let currentCategory = 'image';
let currentUploadIndex = 0;

// 多语言支持
let currentLang = 'zh-CN'; // 默认语言
const langResources = {
    'zh-CN': {
        'title': '手机文件管理器',
        'categories': '分类',
        'images': '图片',
        'videos': '视频',
        'audios': '音频',
        'documents': '文档',
        'apk': '安装包',
        'archives': '压缩包',
        'file_manager': '文件管理',
        'export_settings': '设置导出目录',
        'search_placeholder': '搜索文件...',
        'home': '主目录',
        // 文件类型
        'image': '图片',
        'video': '视频',
        'audio': '音频',
        'document': '文档',
        'apk': '安装包',
        'zip': '压缩包',
        'folder': '文件夹',
        // 预览中的标签
        'type': '类型',
        'size': '大小',
        'date': '创建日期',
        'resolution': '分辨率',
        'duration': '时长',
        'location': '位置',
        'download': '下载',
        'rename': '重命名',
        'delete': '删除',
        'items_count': '包含项目',
        'upload_files': '上传文件',
        'drag_and_drop': '拖拽文件到此处上传',
        'allowed_file_types': '允许的文件类型：',
        'start_upload': '开始上传',
        'cancel_upload': '取消上传'
    },
    'en': {
        'title': 'Mobile File Manager',
        'categories': 'Categories',
        'images': 'Images',
        'videos': 'Videos',
        'audios': 'Audios',
        'documents': 'Documents',
        'apk': 'APK',
        'archives': 'Archives',
        'file_manager': 'File Manager',
        'export_settings': 'Export Directory',
        'search_placeholder': 'Search files...',
        'home': 'Home',
        // 文件类型
        'image': 'Image',
        'video': 'Video',
        'audio': 'Audio',
        'document': 'Document',
        'apk': 'APK',
        'zip': 'Archive',
        'folder': 'Folder',
        // 预览中的标签
        'type': 'Type',
        'size': 'Size',
        'date': 'Date',
        'resolution': 'Resolution',
        'duration': 'Duration',
        'location': 'Location',
        'download': 'Download',
        'rename': 'Rename',
        'delete': 'Delete',
        'items_count': 'Items',
        'upload_files': 'Upload Files',
        'drag_and_drop': 'Drag and drop files here to upload',
        'allowed_file_types': 'Allowed file types: ',
        'start_upload': 'Start Upload',
        'cancel_upload': 'Cancel Upload'
    }
};

// 翻译函数
function t(key) {
    return langResources[currentLang][key] || key;
}

// 检测并设置语言
function detectAndSetLanguage() {
    const userLang = navigator.language || navigator.userLanguage;
    // 支持的语言列表
    const supportedLangs = ['zh-CN', 'en'];

    // 检查完整匹配
    if (supportedLangs.includes(userLang)) {
        currentLang = userLang;
    }
    // 检查主要语言部分（如 zh、en）
    else {
        const primaryLang = userLang.split('-')[0];
        const matchedLang = supportedLangs.find(lang => lang.startsWith(primaryLang));
        if (matchedLang) {
            currentLang = matchedLang;
        }
    }

    // 设置HTML lang属性
    document.documentElement.lang = currentLang;

    // 应用翻译
    applyTranslations();
}

// 应用翻译到页面元素
function applyTranslations() {
    // 设置页面标题
    document.title = t('title');

    // 翻译所有带有data-lang属性的元素
    const elements = document.querySelectorAll('[data-lang]');
    elements.forEach(el => {
        const key = el.getAttribute('data-lang');
        if (key) {
            el.textContent = t(key);
        }
    });

    // 翻译输入框placeholder
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.placeholder = t('search_placeholder');
    }

    // 重新渲染文件列表（如果需要）
    if (filteredFiles.length > 0) {
        renderFiles();
    }
}

// DOM 元素
const gridView = document.getElementById('gridView');
const listView = document.getElementById('listView');
const pagination = document.getElementById('pagination');
const searchInput = document.getElementById('searchInput');
const gridBtn = document.getElementById('gridBtn');
const listBtn = document.getElementById('listBtn');
const previewContainer = document.getElementById('previewContainer');
const previewContent = document.getElementById('previewContent');
const previewTitle = document.getElementById('previewTitle');
const fileName = document.getElementById('fileName');
const closePreview = document.getElementById('closePreview');
const pathBar = document.getElementById('pathBar');
const uploadBtn = document.getElementById('uploadBtn');
const uploadPanel = document.getElementById('uploadPanel');
const closeUpload = document.getElementById('closeUpload');
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const confirmUpload = document.getElementById('confirmUpload');
const cancelUpload = document.getElementById('cancelUpload');
const uploadHint = document.getElementById('uploadHint');
const uploadProgress = document.getElementById('uploadProgress');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const exportPath = document.getElementById('exportPath');

// 初始化函数
function init() {
    // 检测并设置语言
    detectAndSetLanguage();

    // 获取设备信息
    fetchDeviceInfo();
    fetchStorageInfo();

    pathBar.style.display = 'none'; // 初始隐藏路径导航栏

    // 设置事件监听器
    setupEventListeners();
}

function fetchStorageInfo() {
    fetch('/api/storagedir', {
        method: 'GET'
    })
        .then(response => response.json())
        .then(data => {
            exportPath.innerText = data.storage_dir;
        })
        .catch(error => {
            console.error('获取存储信息失败:', error);
        });
}

// 获取设备信息
function fetchDeviceInfo() {
    fetch('/api/device_info', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        body: JSON.stringify({ 'id': serial_id })
    })
        .then(response => response.json())
        .then(data => {
            // 更新设备信息
            const deviceNameEl = document.querySelector('.device-name');
            deviceNameEl.textContent = data.phone_name;

            const phoneCover = document.getElementById('phone-cover');
            phoneCover.src = data.cover_img;

            const storageEl = document.querySelector('.storage');
            storageEl.textContent = `${data.storage_use_size}GB 可用 / ${data.storage_total_size}GB`;

            // 更新电池状态
            updateBattery(data.battery_use);

            // 获取图片
            getImages();
        })
        .catch(error => {
            console.error('获取设备信息失败:', error);
            // 使用模拟数据
            updateBattery(78);
            getImages();
        });
}

function deleteFile(_data) {
    fetch(`/api/delete_file?id=${serial_id}&data=${_data}`, {
        method: 'GET'
    })
        .then(response => response.json())
        .then(data => {
            previewContainer.classList.remove('active');

            setTimeout(() => {
                switch (currentCategory) {
                    case 'image':
                        getImages();
                        break;
                    case 'video':
                        getVideos();
                        break;
                    case 'audio':
                        getAudios();
                        break;
                    case 'document':
                        getDocuments('document');
                        break;
                    case 'apk':
                        getDocuments('apk');
                        break;
                    case 'zip':
                        getDocuments('zip');
                        break;
                    case 'all':
                        pathBar.style.display = '';
                        //currentPath = '';
                        pathHistory = [];
                        renderPathBar();
                        navigateToPath(currentPath);
                        break;
                }
            }, 500);

        })
        .catch(error => {
            console.error('删除文件请求失败:', error);
        });
}

function renameFile(old_path, current_name) {
    const new_name = prompt(`请输入新的文件名（当前名称：${current_name}）:`, current_name);
    
    if (!new_name || new_name.trim() === '' || new_name === current_name) {
        return;
    }
    
    const encoded_old_path = encodeURIComponent(old_path);
    const encoded_new_name = encodeURIComponent(new_name.trim());
    
    fetch(`/api/rename_file?id=${serial_id}&old_path=${encoded_old_path}&new_name=${encoded_new_name}`, {
        method: 'GET'
    })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                alert(`重命名失败: ${data.error}`);
                return;
            }
            
            alert('文件重命名成功！');
            previewContainer.classList.remove('active');
            
            setTimeout(() => {
                switch (currentCategory) {
                    case 'image':
                        getImages();
                        break;
                    case 'video':
                        getVideos();
                        break;
                    case 'audio':
                        getAudios();
                        break;
                    case 'document':
                        getDocuments('document');
                        break;
                    case 'apk':
                        getDocuments('apk');
                        break;
                    case 'zip':
                        getDocuments('zip');
                        break;
                    case 'all':
                        pathBar.style.display = '';
                        pathHistory = [];
                        renderPathBar();
                        navigateToPath(currentPath);
                        break;
                }
            }, 500);
        })
        .catch(error => {
            console.error('重命名文件请求失败:', error);
            alert('重命名请求失败，请检查网络连接');
        });
}

// 更新电池状态
function updateBattery(percent) {
    const batteryElement = document.getElementById('battery-level');
    const textElement = document.getElementById('battery-text');

    // 更新电量百分比
    batteryElement.style.setProperty('--battery-level', percent);
    textElement.textContent = percent + '%';

    // 根据电量设置颜色
    let color;
    if (percent <= 20) color = '#ff4d4f';    // 红色
    else if (percent <= 40) color = '#faad14'; // 黄色
    else color = '#52c41a';                  // 绿色

    batteryElement.style.setProperty('--battery-color', color);
}


// 更新上传提示
function updateUploadHint() {
    const typeNames = {
        'image': 'Photos (JPG, PNG, GIF)',
        'video': 'Videos (MP4, MOV, AVI)',
        'audio': 'Audios (MP3, WAV)',
        'document': 'Documents (PDF, DOC, DOCX)',
        'apk': 'Apks (APK)',
        'zip': 'Archives (ZIP, RAR)',
        'all': 'All Types'
    };

    uploadHint.textContent = `Allowed file types: ${typeNames[currentCategory] || 'All Types'}`;
}

// 获取图片文件
function getImages() {
    fetch(`/api/get_images?id=${serial_id}`)
        .then(response => response.json())
        .then(data => {
            // 更新上传提示
            updateUploadHint();
            filesData = [];
            currentPage = 1; // 重置当前页码
            // 处理返回的文件数据
            data.forEach(file => {
                const thumbnail_url = `/api/thumbnail?file_path=${encodeURIComponent(file._data)}&category=images&file_name=${encodeURIComponent(file._display_name)}&id=${serial_id}`;
                const url = `/api/file?file_path=${encodeURIComponent(file._data)}&category=images&file_name=${encodeURIComponent(file._display_name)}&id=${serial_id}`;
                filesData.push({
                    id: file._id,
                    data: file._data,
                    name: file._display_name,
                    size: formatFileSize(file._size),
                    type: "image",
                    mime_type: file.mime_type,
                    date: formatTimestamp(file.date_added),
                    thumbnail: thumbnail_url,
                    previewUrl: url,
                    path: file.path,
                    width: file.width,
                    height: file.height
                });
            });

            // 更新文件列表
            filteredFiles = [...filesData];
            renderFiles();
        })
        .catch(error => {
            console.error('获取图片失败:', error);
        });
}

// 获取图片文件
function getVideos() {
    fetch(`/api/get_videos?id=${serial_id}`)
        .then(response => response.json())
        .then(data => {
            filesData = [];
            currentPage = 1; // 重置当前页码
            // 处理返回的文件数据
            data.forEach(file => {
                const thumbnail_url = `/api/thumbnail?file_path=${encodeURIComponent(file._data)}&category=video&file_name=${encodeURIComponent(file._display_name)}&id=${serial_id}`;
                const url = `/api/file?file_path=${encodeURIComponent(file._data)}&category=video&file_name=${encodeURIComponent(file._display_name)}&id=${serial_id}`;
                filesData.push({
                    id: file._id,
                    data: file._data,
                    name: file._display_name,
                    size: formatFileSize(file._size),
                    type: "video",
                    mime_type: file.mime_type,
                    date: formatTimestamp(file.date_added),
                    thumbnail: thumbnail_url,
                    previewUrl: url,
                    path: file.path,
                    width: file.width,
                    height: file.height
                });
            });

            // 更新文件列表
            filteredFiles = [...filesData];
            renderFiles();
        })
        .catch(error => {
            console.error('获取视频失败:', error);
        });
}

// 获取音频文件
function getAudios() {
    fetch(`/api/get_audios?id=${serial_id}`)
        .then(response => response.json())
        .then(data => {
            filesData = [];
            currentPage = 1; // 重置当前页码
            // 处理返回的文件数据
            data.forEach(file => {
                const url = `/api/file?file_path=${encodeURIComponent(file._data)}&category=audio&file_name=${encodeURIComponent(file._display_name)}&id=${serial_id}`;
                filesData.push({
                    id: file._id,
                    data: file._data,
                    name: file._display_name,
                    size: formatFileSize(file._size),
                    type: "audio",
                    mime_type: file.mime_type,
                    date: formatTimestamp(file.date_added),
                    previewUrl: url,
                    path: file.path
                });
            });

            // 更新文件列表
            filteredFiles = [...filesData];
            renderFiles();
        })
        .catch(error => {
            console.error('获取音频失败:', error);
        });
}

// 获取文档文件
function getDocuments(documentType) {
    fetch(`/api/get_documents?id=${serial_id}&document_type=${documentType}`)
        .then(response => response.json())
        .then(data => {
            filesData = [];
            currentPage = 1; // 重置当前页码
            // 处理返回的文件数据
            data.forEach(file => {
                const url = `/api/file?file_path=${encodeURIComponent(file._data)}&category=${documentType}&file_name=${encodeURIComponent(file._display_name)}&id=${serial_id}`;
                filesData.push({
                    id: file._id,
                    data: file._data,
                    name: file._display_name,
                    size: formatFileSize(file._size),
                    type: documentType,
                    mime_type: file.mime_type,
                    date: formatTimestamp(file.date_added),
                    previewUrl: url,
                    path: file.path
                });
            });

            // 更新文件列表
            filteredFiles = [...filesData];
            renderFiles();
        })
        .catch(error => {
            console.error('获取文档失败:', error);
        });
}

function getFileCategory(file) {
    const mimeType = file.mime_type;
    if (mimeType.startsWith("image/")) {
        return "images";
    } else if (mimeType.startsWith("video/")) {
        return "videos";
    } else if (mimeType.startsWith("audio/")) {
        return "audios";
    } else {
        return "documents";
    }
}

// 渲染路径导航栏
function renderPathBar() {
    pathBar.innerHTML = '';

    // 分割路径
    const pathParts = currentPath.split('/').filter(part => part !== '');

    // 添加主目录
    const homeItem = document.createElement('div');
    homeItem.className = 'path-item';
    homeItem.dataset.path = '/';
    homeItem.innerHTML = `<i class="fas fa-home"></i><span>${t('home')}</span>`;
    homeItem.addEventListener('click', () => navigateToPath('/sdcard/'));
    pathBar.appendChild(homeItem);

    // 添加路径部分
    let currentPathStr = '';
    for (let i = 0; i < pathParts.length; i++) {
        currentPathStr += '/' + pathParts[i];

        const separator = document.createElement('div');
        separator.className = 'path-separator';
        separator.innerHTML = '<i class="fas fa-chevron-right"></i>';
        pathBar.appendChild(separator);

        const pathItem = document.createElement('div');
        pathItem.className = 'path-item';
        if (i === pathParts.length - 1) {
            pathItem.classList.add('current');
        }
        pathItem.dataset.path = currentPathStr;
        if (pathItem.dataset.path === '/sdcard') {
            pathItem.dataset.path = '/sdcard/';
        }
        pathItem.textContent = pathParts[i];
        pathItem.addEventListener('click', (self) => {
            console.log(`Navigating to: ${self.target.dataset.path}`);
            // 点击路径部分时导航到对应路径
            navigateToPath(self.target.dataset.path);
        });
        pathBar.appendChild(pathItem);
    }
}

// 获取音频文件
function getFiles(path = '/sdcard/') {
    fetch(`/api/get_files?id=${serial_id}&path=${encodeURIComponent(path)}`)
        .then(response => response.json())
        .then(data => {
            filesData = [];
            currentPage = 1; // 重置当前页码
            // 处理返回的文件数据
            data.forEach(file => {
                var thumbnail_url = null;
                var category = null;
                if (file.mime_type != "inode/directory") {
                    category = getFileCategory(file);
                    if (category === "images" || category === "videos") {
                        thumbnail_url = `/api/thumbnail?file_path=${encodeURIComponent(file._data)}&category=${category}&file_name=${encodeURIComponent(file._display_name)}&id=${serial_id}`;
                    }
                }

                const url = `/api/file?file_path=${encodeURIComponent(file._data)}&category=${file.mime_type == "inode/directory" ? "folder" : category}&file_name=${encodeURIComponent(file._display_name)}&id=${serial_id}`;
                filesData.push({
                    id: file._id,
                    data: file._data,
                    name: file._display_name,
                    size: formatFileSize(file._size),
                    type: file.mime_type == "inode/directory" ? "folder" : category.substring(0, category.length - 1), // 去掉最后的 's'
                    mime_type: file.mime_type,
                    date: formatTimestamp(file.date_added),
                    previewUrl: url,
                    thumbnail: thumbnail_url,
                    path: file.path
                });
            });

            // 更新文件列表
            filteredFiles = [...filesData];
            renderFiles();
        })
        .catch(error => {
            console.error('获取文件失败:', error);
        });
}

// 格式化文件大小
function formatFileSize(bytes) {
    if (bytes < 1024) {
        return bytes + ' B';
    } else if (bytes < 1024 * 1024) {
        return (bytes / 1024).toFixed(2) + ' KB';
    } else {
        return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    }
}

// 格式化时间戳
function formatTimestamp(timestamp) {
    // 将秒级时间戳转换为毫秒并创建Date对象
    const date = new Date(timestamp * 1000);

    // 获取本地时间的年、月、日
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    // 返回格式化后的字符串
    return `${year}年${month}月${day}日`;
}

// 设置事件监听器
function setupEventListeners() {
    // 视图切换功能
    gridBtn.addEventListener('click', () => {
        gridBtn.classList.add('active');
        listBtn.classList.remove('active');
        gridView.classList.add('active');
        listView.classList.remove('active');
        currentView = 'grid';
        renderFiles();
    });

    listBtn.addEventListener('click', () => {
        listBtn.classList.add('active');
        gridBtn.classList.remove('active');
        listView.classList.add('active');
        gridView.classList.remove('active');
        currentView = 'list';
        renderFiles();
    });

    // 菜单项点击效果
    const menuItems = document.querySelectorAll('.menu-item');
    menuItems.forEach(item => {
        item.addEventListener('click', function () {
            // 记录当前分类
            currentCategory = this.dataset.category || 'all';

            // 更新上传提示
            updateUploadHint();

            menuItems.forEach(i => i.classList.remove('active'));
            this.classList.add('active');
            console.log(`Clicked on ${this.id}`);
            if (this.id == 'menu-images') {
                pathBar.style.display = 'none';
                getImages();
            } else if (this.id == 'menu-videos') {
                pathBar.style.display = 'none';
                getVideos();
            } else if (this.id == 'menu-audios') {
                pathBar.style.display = 'none';
                getAudios();
            } else if (this.id == 'menu-documents') {
                pathBar.style.display = 'none';
                getDocuments('document');
            } else if (this.id == 'menu-apk') {
                pathBar.style.display = 'none';
                getDocuments('apk');
            } else if (this.id == 'menu-archives') {
                pathBar.style.display = 'none';
                getDocuments('zip');
            } else if (this.id == 'menu-file-manager') {
                pathBar.style.display = '';
                currentPath = '';
                pathHistory = [];
                renderPathBar();
                getFiles();
            }
        });
    });

    // 搜索功能
    searchInput.addEventListener('input', function () {
        const searchTerm = this.value.toLowerCase();
        if (searchTerm) {
            filteredFiles = filesData.filter(file =>
                file.name.toLowerCase().includes(searchTerm) ||
                file.type.includes(searchTerm)
            );
        } else {
            filteredFiles = [...filesData];
        }
        currentPage = 1;
        renderFiles();
    });

    // 关闭预览
    closePreview.addEventListener('click', () => {
        previewContainer.classList.remove('active');
    });

    // 上传功能
    uploadBtn.addEventListener('click', () => {
        uploadPanel.classList.add('active');
        selectedFiles = [];
        fileInput.value = '';
        progressFill.style.width = '0%';
        progressText.textContent = '0%';
        uploadProgress.style.display = 'none';
    });

    closeUpload.addEventListener('click', () => {
        uploadPanel.classList.remove('active');
    });

    cancelUpload.addEventListener('click', () => {
        uploadPanel.classList.remove('active');
    });

    uploadArea.addEventListener('click', () => {
        fileInput.click();
    });

    fileInput.addEventListener('change', function (e) {
        selectedFiles = Array.from(e.target.files);
        if (selectedFiles.length > 0) {
            uploadHint.textContent = `已选择 ${selectedFiles.length} 个文件`;
        }
    });

    function uploadFile(file) {

        const formData = new FormData();
        formData.append('file', file); // 只上传第一个文件

        const xhr = new XMLHttpRequest();

        // Listen for the upload progress event
        xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
                const percentComplete = (event.loaded / event.total) * 100;
                progressFill.style.width = percentComplete.toFixed(2) + '%';
                progressText.textContent = percentComplete.toFixed(2) + '%';
            }
        };

        // Listen for load (success) event
        xhr.onload = () => {
            if (xhr.status === 200) {
                const response = JSON.parse(xhr.responseText);
                uploadPanel.classList.remove('active');
                uploadHint.textContent = `文件上传成功: ${response.filename}`;
                progressFill.style.width = '100%'; // Ensure 100% on completion
                progressText.textContent = '100%';

                currentUploadIndex++;
                if (currentUploadIndex === selectedFiles.length) {
                    setTimeout(() => {
                        pathBar.style.display = '';
                        currentPath = '';
                        pathHistory = [];
                        renderPathBar();
                        navigateToPath(response.phonedir);
                    }, 500);
                    return;
                }
                uploadFile(selectedFiles[currentUploadIndex]); // 上传下一个文件
            } else {
                const errorResponse = JSON.parse(xhr.responseText);
                alert('文件上传失败:', errorResponse);
            }
        };

        // Listen for error event
        xhr.onerror = () => {
            alert('网络或服务器错误!');
        };

        // Open and send the request
        xhr.open('POST', `/api/upload?id=${serial_id}&category=${currentCategory}`);
        xhr.send(formData);
    }

    confirmUpload.addEventListener('click', () => {
        if (selectedFiles.length === 0) {
            alert('请先选择要上传的文件');
            return;
        }

        // 检查文件类型限制
        if (!validateFileTypes(selectedFiles)) {
            return;
        }

        // 显示上传进度
        uploadProgress.style.display = 'block';
        console.log('开始上传文件:', selectedFiles);
        currentUploadIndex = 0;
      
        uploadFile(selectedFiles[currentUploadIndex]); // 只上传第一个文件
    });

    // 验证文件类型
    function validateFileTypes(files) {
        // 文件管理菜单允许所有类型
        if (currentCategory === 'all') return true;

        const allowedTypes = {
            'image': ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
            'video': ['video/mp4', 'video/quicktime', 'video/x-msvideo'],
            'audio': ['audio/mpeg', 'audio/wav', 'audio/ogg'],
            'document': ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
            'apk': ['application/vnd.android.package-archive'],
            'zip': ['application/zip', 'application/x-zip-compressed', 'application/x-rar-compressed']
        };

        const currentAllowed = allowedTypes[currentCategory] || [];

        for (const file of files) {
            if (!currentAllowed.includes(file.type)) {
                alert(`错误：文件 ${file.name} 的类型不被允许。当前菜单只允许上传 ${getTypeName(currentCategory)} 文件。`);
                return false;
            }
        }

        return true;
    }


    // 文件卡片悬停效果增强
    document.addEventListener('mouseover', function (e) {
        if (e.target.closest('.file-card, .list-item')) {
            const card = e.target.closest('.file-card, .list-item');
            if (card.classList.contains('file-card')) {
                card.style.transform = 'translateY(-7px)';
            } else {
                card.style.transform = 'translateX(7px)';
            }
        }
    });

    document.addEventListener('mouseout', function (e) {
        if (e.target.closest('.file-card, .list-item')) {
            const card = e.target.closest('.file-card, .list-item');
            card.style.transform = 'none';
        }
    });

    // 搜索框聚焦效果
    searchInput.addEventListener('focus', function () {
        this.parentElement.style.boxShadow = '0 5px 15px rgba(108, 99, 255, 0.2)';
    });

    searchInput.addEventListener('blur', function () {
        this.parentElement.style.boxShadow = 'none';
    });
}

// 路径导航
function navigateToPath(path) {
    currentPath = path;
    pathHistory.push(path);
    renderPathBar();
    //filteredFiles = filesData.filter(file => file.path === currentPath);
    currentPage = 1;
    getFiles(currentPath);
}

// 渲染文件函数
function renderFiles() {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const currentFiles = filteredFiles.slice(startIndex, endIndex);

    // 清空当前视图
    gridView.innerHTML = '';
    listView.innerHTML = '';

    // 渲染文件
    currentFiles.forEach(file => {
        if (currentView === 'grid') {
            renderGridItem(file);
        } else {
            renderListItem(file);
        }
    });

    // 渲染分页
    renderPagination();
}

// 渲染宫格视图项目
function renderGridItem(file) {
    const fileCard = document.createElement('div');
    fileCard.className = 'file-card';

    let typeClass = '';
    let iconClass = '';

    switch (file.type) {
        case 'image':
            typeClass = 'image-color';
            iconClass = 'fas fa-image';
            break;
        case 'video':
            typeClass = 'video-color';
            iconClass = 'fas fa-video';
            break;
        case 'audio':
            typeClass = 'audio-color';
            iconClass = 'fas fa-music';
            break;
        case 'document':
            typeClass = 'doc-color';
            iconClass = 'fas fa-file-alt';
            if (file.mime_type && file.mime_type.includes('pdf')) {
                typeClass = 'pdf-color';
                iconClass = 'fas fa-file-pdf';
            } else if (file.mime_type && file.mime_type.includes('word')) {
                typeClass = 'doc-color';
                iconClass = 'fas fa-file-word';
            } else if (file.mime_type && file.mime_type.includes('excel')) {
                typeClass = 'xls-color';
                iconClass = 'fas fa-file-excel';
            } else if (file.mime_type && file.mime_type.includes('powerpoint')) {
                typeClass = 'ppt-color';
                iconClass = 'fas fa-file-powerpoint';
            } else if (file.mime_type && file.mime_type.includes('text')) {
                typeClass = 'txt-color';
                iconClass = 'fas fa-file-alt';
            }
            break;
        case 'apk':
            typeClass = 'apk-color';
            iconClass = 'fas fa-cube';
            break;
        case 'zip':
            typeClass = 'zip-color';
            iconClass = 'fas fa-file-archive';
            break;
        case 'folder':
            typeClass = 'folder-color';
            iconClass = 'fas fa-folder';
            break;
    }

    fileCard.innerHTML = `
        <div class="thumbnail-container">
            ${file.thumbnail ?
            `<img src="${file.thumbnail}" alt="${file.name}" class="thumbnail">` :
            `<i class="${iconClass} file-icon ${typeClass}"></i>`
        }
        </div>
        <div class="file-name">${file.name}</div>
        <div class="file-size">${file.size}</div>
        <div class="file-type">${getTypeName(file.type)}</div>
    `;

    fileCard.addEventListener('click', () => {
        if (file.type === 'folder') {
            navigateToPath(file.path + (file.path.endsWith("/") ? '' : '/') + file.name);
        } else {
            showPreview(file);
        }
    });

    gridView.appendChild(fileCard);
}

// 渲染列表视图项目
function renderListItem(file) {
    const listItem = document.createElement('div');
    listItem.className = 'list-item';

    let typeClass = '';
    let iconClass = '';

    switch (file.type) {
        case 'image':
            typeClass = 'image-color';
            iconClass = 'fas fa-image';
            break;
        case 'video':
            typeClass = 'video-color';
            iconClass = 'fas fa-video';
            break;
        case 'audio':
            typeClass = 'audio-color';
            iconClass = 'fas fa-music';
            break;
        case 'document':
            typeClass = 'doc-color';
            iconClass = 'fas fa-file-alt';
            if (file.mime_type && file.mime_type.includes('pdf')) {
                typeClass = 'pdf-color';
                iconClass = 'fas fa-file-pdf';
            } else if (file.mime_type && file.mime_type.includes('word')) {
                typeClass = 'doc-color';
                iconClass = 'fas fa-file-word';
            } else if (file.mime_type && file.mime_type.includes('excel')) {
                typeClass = 'xls-color';
                iconClass = 'fas fa-file-excel';
            } else if (file.mime_type && file.mime_type.includes('powerpoint')) {
                typeClass = 'ppt-color';
                iconClass = 'fas fa-file-powerpoint';
            } else if (file.mime_type && file.mime_type.includes('text')) {
                typeClass = 'txt-color';
                iconClass = 'fas fa-file-alt';
            }
            break;
        case 'apk':
            typeClass = 'apk-color';
            iconClass = 'fas fa-cube';
            break;
        case 'zip':
            typeClass = 'zip-color';
            iconClass = 'fas fa-file-archive';
            break;
        case 'folder':
            typeClass = 'folder-color';
            iconClass = 'fas fa-folder';
            break;
    }

    listItem.innerHTML = `
        <div class="list-thumbnail">
            ${file.thumbnail ?
            `<img src="${file.thumbnail}" alt="${file.name}">` :
            `<i class="${iconClass} list-icon ${typeClass}"></i>`
        }
        </div>
        <div class="list-details">
            <div class="list-name">${file.name}</div>
            <div class="list-info">
                <span class="list-size">${file.size}</span>
                <span class="list-date">${file.date}</span>
            </div>
        </div>
    `;

    listItem.addEventListener('click', () => {
        if (file.type === 'folder') {
            navigateToPath(file.path + (file.path.endsWith("/") ? '' : '/') + file.name);
        } else {
            showPreview(file);
        }
    });

    listView.appendChild(listItem);
}

// 获取类型名称
function getTypeName(type) {
    return t(type) || type;
}

// 渲染分页控件
function renderPagination() {
    const totalPages = Math.ceil(filteredFiles.length / itemsPerPage);
    pagination.innerHTML = '';

    // 上一页按钮
    const prevBtn = document.createElement('button');
    prevBtn.className = `page-btn prev-btn ${currentPage === 1 ? 'disabled' : ''}`;
    prevBtn.innerHTML = '<i class="fas fa-chevron-left"></i>';
    prevBtn.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            renderFiles();
        }
    });
    pagination.appendChild(prevBtn);

    // 页码按钮
    const maxPages = 5; // 最多显示5个页码
    let startPage = Math.max(1, currentPage - Math.floor(maxPages / 2));
    let endPage = startPage + maxPages - 1;

    if (endPage > totalPages) {
        endPage = totalPages;
        startPage = Math.max(1, endPage - maxPages + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
        const pageBtn = document.createElement('button');
        pageBtn.className = `page-btn ${i === currentPage ? 'active' : ''}`;
        pageBtn.textContent = i;
        pageBtn.addEventListener('click', () => {
            currentPage = i;
            renderFiles();
        });
        pagination.appendChild(pageBtn);
    }

    // 下一页按钮
    const nextBtn = document.createElement('button');
    nextBtn.className = `page-btn next-btn ${currentPage === totalPages ? 'disabled' : ''}`;
    nextBtn.innerHTML = '<i class="fas fa-chevron-right"></i>';
    nextBtn.addEventListener('click', () => {
        if (currentPage < totalPages) {
            currentPage++;
            renderFiles();
        }
    });
    pagination.appendChild(nextBtn);
}

// 显示文件预览
function showPreview(file) {
    currentPreviewFile = file;

    // 更新预览标题
    fileName.textContent = file.name;
    // 设置预览图标
    let iconClass = '';
    switch (file.type) {
        case 'image': iconClass = 'fas fa-image'; break;
        case 'video': iconClass = 'fas fa-video'; break;
        case 'audio': iconClass = 'fas fa-music'; break;
        case 'document':
            iconClass = 'fas fa-file-alt';
            if (file.mime_type && file.mime_type.includes('pdf')) {

                iconClass = 'fas fa-file-pdf';
            } else if (file.mime_type && file.mime_type.includes('word')) {

                iconClass = 'fas fa-file-word';
            } else if (file.mime_type && file.mime_type.includes('excel')) {

                iconClass = 'fas fa-file-excel';
            } else if (file.mime_type && file.mime_type.includes('powerpoint')) {

                iconClass = 'fas fa-file-powerpoint';
            } else if (file.mime_type && file.mime_type.includes('text')) {

                iconClass = 'fas fa-file-alt';
            }
            break;
        case 'apk': iconClass = 'fas fa-cube'; break;
        case 'zip': iconClass = 'fas fa-file-archive'; break;
        case 'folder': iconClass = 'fas fa-folder'; break;
        default: iconClass = 'fas fa-file';
    }
    previewTitle.innerHTML = `<i class="${iconClass}"></i><span style="max-width:300px">${file.name}</span>`;

    // 生成预览内容
    let previewHTML = '';

    if (file.type === 'image' && file.previewUrl) {
        previewHTML = `
            <img src="${file.previewUrl}" alt="${file.name}" class="preview-image">
            <div class="preview-details">
                <div class="detail-item">
                    <span class="detail-label">${t('type')}</span>
                    <span class="detail-value">${t('image')}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">${t('size')}</span>
                    <span class="detail-value">${file.size}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">${t('date')}</span>
                    <span class="detail-value">${file.date}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">${t('resolution')}</span>
                    <span class="detail-value">${file.width}×${file.height}</span>
                </div>
            </div>
        `;
    } else if (file.type === 'video' && file.previewUrl) {
        previewHTML = `
            <video controls class="preview-video">
                <source src="${file.previewUrl}" type="video/mp4">
                ${t('video_not_supported')}
            </video>
            <div class="preview-details">
                <div class="detail-item">
                    <span class="detail-label">${t('type')}</span>
                    <span class="detail-value">${t('video')}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">${t('size')}</span>
                    <span class="detail-value">${file.size}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">${t('date')}</span>
                    <span class="detail-value">${file.date}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">${t('duration')}</span>
                    <span class="detail-value">5:32</span>
                </div>
            </div>
        `;
    } else if (file.type === 'audio' && file.previewUrl) {
        previewHTML = `
            <div class="preview-audio-container" style="text-align: center; padding: 20px;">
                <i class="fas fa-music" style="font-size: 80px; color: #FFA41B; margin-bottom: 20px;"></i>
                <audio controls style="width: 100%;">
                    <source src="${file.previewUrl}" type="audio/mpeg">
                    ${t('audio_not_supported')}
                </audio>
            </div>
            <div class="preview-details">
                <div class="detail-item">
                    <span class="detail-label">${t('type')}</span>
                    <span class="detail-value">${t('audio')}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">${t('size')}</span>
                    <span class="detail-value">${file.size}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">${t('date')}</span>
                    <span class="detail-value">${file.date}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">${t('duration')}</span>
                    <span class="detail-value">3:45</span>
                </div>
            </div>
        `;
    } else if (file.type === 'folder') {
        previewHTML = `
            <div style="text-align: center; padding: 40px 0;">
                <i class="fas fa-folder" style="font-size: 100px; color: #FFD93D;"></i>
                <h3 style="margin: 20px 0 10px;">${file.name}</h3>
                <p>${file.size}</p>
            </div>
            <div class="preview-details">
                <div class="detail-item">
                    <span class="detail-label">${t('type')}</span>
                    <span class="detail-value">${t('folder')}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">${t('items_count')}</span>
                    <span class="detail-value">${file.size}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">${t('date')}</span>
                    <span class="detail-value">${file.date}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">${t('location')}</span>
                    <span class="detail-value">/storage/emulated/0/${file.name}</span>
                </div>
            </div>
        `;
    } else if (file.type === 'document' && file.mime_type && file.mime_type.includes('pdf')) {
        // PDF文档预览
        previewHTML = `
            <div class="pdf-preview-container">
                <iframe src="${file.previewUrl}" class="pdf-preview-frame" title="${file.name}"></iframe>
                <div class="pdf-preview-note">
                    <i class="fas fa-info-circle"></i> 如果PDF无法显示，请 <a href="${file.previewUrl}" target="_blank">点击这里下载</a> 后查看
                </div>
            </div>
            <div class="preview-details">
                <div class="detail-item">
                    <span class="detail-label">${t('type')}</span>
                    <span class="detail-value">${t('document')} (PDF)</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">${t('size')}</span>
                    <span class="detail-value">${file.size}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">${t('date')}</span>
                    <span class="detail-value">${file.date}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">${t('location')}</span>
                    <span class="detail-value">${file.data}</span>
                </div>
            </div>
        `;
    } else {
        // 通用文件预览
        let fileIcon = '';
        let fileColor = '';

        switch (file.type) {
            case 'document':
                fileIcon = 'fas fa-file-alt';
                fileColor = '#6BCB77';
                if (file.mime_type && file.mime_type.includes('pdf')) {
                    fileIcon = 'fas fa-file-pdf';
                } else if (file.mime_type && file.mime_type.includes('word')) {
                    fileIcon = 'fas fa-file-word';
                } else if (file.mime_type && file.mime_type.includes('excel')) {
                    fileIcon = 'fas fa-file-excel';
                } else if (file.mime_type && file.mime_type.includes('powerpoint')) {
                    fileIcon = 'fas fa-file-powerpoint';
                } else if (file.mime_type && file.mime_type.includes('text')) {
                    fileIcon = 'fas fa-file-alt';
                }
                break;
            case 'apk':
                fileIcon = 'fas fa-cube';
                fileColor = '#9C51E0';
                break;
            case 'zip':
                fileIcon = 'fas fa-file-archive';
                fileColor = '#FF78F0';
                break;
            default:
                fileIcon = 'fas fa-file';
                fileColor = '#6C63FF';
        }

        previewHTML = `
            <div style="text-align: center; padding: 40px 0;">
                <i class="${fileIcon}" style="font-size: 100px; color: ${fileColor};"></i>
                <h3 style="margin: 20px 0 10px;">${file.name}</h3>
                <p>${file.size}</p>
            </div>
            <div class="preview-details">
                <div class="detail-item">
                    <span class="detail-label">${t('type')}</span>
                    <span class="detail-value">${t(file.type)}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">${t('size')}</span>
                    <span class="detail-value">${file.size}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">${t('date')}</span>
                    <span class="detail-value">${file.date}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">${t('location')}</span>
                    <span class="detail-value">${file.data}</span>
                </div>
            </div>
        `;
    }

    // 添加操作按钮
    previewHTML += `
        <div class="file-actions">
            <button onclick="window.open('${file.previewUrl}')" class="action-btn">
                <i class="fas fa-download"></i> ${t('download')}
            </button>
            <button class="action-btn" onclick="renameFile('${file.data}', '${file.name}')">
                <i class="fas fa-share-alt"></i> ${t('rename')}
            </button>
            <button class="action-btn" onclick="deleteFile('${file.data}')">
                <i class="fas fa-trash-alt"></i> ${t('delete')}
            </button>
        </div>
    `;

    previewContent.innerHTML = previewHTML;

    // 显示预览面板
    previewContainer.classList.add('active');
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', init);