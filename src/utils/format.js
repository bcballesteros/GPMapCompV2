export function formatFileSize(bytes) {
    if (bytes === 0) {
        return '0 Bytes';
    }

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const index = Math.floor(Math.log(bytes) / Math.log(k));
    return `${Math.round((bytes / Math.pow(k, index)) * 100) / 100} ${sizes[index]}`;
}

export function randomToken(length = 8) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let token = '';

    for (let index = 0; index < length; index += 1) {
        token += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    return token;
}
