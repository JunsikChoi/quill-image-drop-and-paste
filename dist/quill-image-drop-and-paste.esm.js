var utils = {
    /* detect the giving url is a image
     */
    urlIsImage(url, abortTimeout = 3000) {
        if (!this.validURL(url)) {
            return Promise.reject(false);
        }
        if (/\.(jpeg|jpg|gif|png|webp|tiff|bmp)$/.test(url)) {
            return Promise.resolve(true);
        }
        return new Promise((resolve, reject) => {
            let timer = undefined;
            const img = new Image();
            img.onerror = img.onabort = () => {
                clearTimeout(timer);
                reject(false);
            };
            img.onload = () => {
                clearTimeout(timer);
                resolve(true);
            };
            timer = setTimeout(() => {
                img.src = '//!/an/invalid.jpg';
                reject(false);
            }, abortTimeout);
            img.src = url;
        });
    },
    /* check string is a valid url
     */
    validURL(str) {
        try {
            return Boolean(new URL(str));
        }
        catch (e) {
            return false;
        }
    },
    /* check the giving string is a html text
     */
    isHtmlText(clipboardDataItems) {
        let isHtml = false;
        Array.prototype.forEach.call(clipboardDataItems, (item) => {
            if (item.type.match(/^text\/html$/i)) {
                isHtml = true;
            }
        });
        return isHtml;
    },
    /* resolve dataUrl to base64 string
     */
    resolveDataUrl(dataUrl) {
        let str = '';
        if (typeof dataUrl === 'string') {
            str = dataUrl;
        }
        else if (dataUrl instanceof ArrayBuffer) {
            str = this.arrayBufferToBase64Url(dataUrl);
        }
        return str;
    },
    /* generate array buffer from binary string
     */
    binaryStringToArrayBuffer(binary) {
        const len = binary.length;
        const buffer = new ArrayBuffer(len);
        const arr = new Uint8Array(buffer);
        let i = -1;
        while (++i < len)
            arr[i] = binary.charCodeAt(i);
        return buffer;
    },
    /* generate base64 string from array buffer
     */
    arrayBufferToBase64Url(arrayBuffer) {
        return btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
    },
};

class ImageData {
    constructor(dataUrl, type) {
        this.dataUrl = dataUrl;
        this.type = type;
    }
    /* minify the image
     */
    minify(option) {
        return new Promise((resolve, reject) => {
            const maxWidth = option.maxWidth || 800;
            const maxHeight = option.maxHeight || 800;
            const quality = option.quality || 0.8;
            if (!this.dataUrl) {
                return reject({
                    message: '[error] QuillImageDropAndPaste: Fail to minify the image, dataUrl should not be empty.',
                });
            }
            const image = new Image();
            image.onload = () => {
                const width = image.width;
                const height = image.height;
                if (width > height) {
                    if (width > maxWidth) {
                        image.height = (height * maxWidth) / width;
                        image.width = maxWidth;
                    }
                }
                else {
                    if (height > maxHeight) {
                        image.width = (width * maxHeight) / height;
                        image.height = maxHeight;
                    }
                }
                const canvas = document.createElement('canvas');
                canvas.width = image.width;
                canvas.height = image.height;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.drawImage(image, 0, 0, image.width, image.height);
                    const canvasType = this.type || 'image/png';
                    const canvasDataUrl = canvas.toDataURL(canvasType, quality);
                    resolve(new ImageData(canvasDataUrl, canvasType));
                }
                else {
                    reject({
                        message: '[error] QuillImageDropAndPaste: Fail to minify the image, create canvas context failure.',
                    });
                }
            };
            image.src = utils.resolveDataUrl(this.dataUrl);
        });
    }
    /* convert blob to file
     */
    toFile(filename) {
        if (!window.File) {
            console.error('[error] QuillImageDropAndPaste: Your browser didnot support File API.');
            return null;
        }
        return new File([this.toBlob()], filename, { type: this.type });
    }
    /* convert dataURL to blob
     */
    toBlob() {
        const base64 = utils.resolveDataUrl(this.dataUrl).replace(/^[^,]+,/, '');
        const buff = utils.binaryStringToArrayBuffer(atob(base64));
        return this.createBlob([buff], { type: this.type });
    }
    /* create blob
     */
    createBlob(parts, properties) {
        if (!properties)
            properties = {};
        if (typeof properties === 'string')
            properties = { type: properties };
        try {
            return new Blob(parts, properties);
        }
        catch (e) {
            if (e.name !== 'TypeError')
                throw e;
            const Builder = 'BlobBuilder' in window
                ? window.BlobBuilder
                : 'MSBlobBuilder' in window
                    ? window.MSBlobBuilder
                    : 'MozBlobBuilder' in window
                        ? window.MozBlobBuilder
                        : window.WebKitBlobBuilder;
            const builder = new Builder();
            for (let i = 0; i < parts.length; i++)
                builder.append(parts[i]);
            return builder.getBlob(properties.type);
        }
    }
}
class ImageDropAndPaste {
    constructor(quill, option) {
        this.quill = quill;
        this.option = option;
        this.handleDrop = this.handleDrop.bind(this);
        this.handlePaste = this.handlePaste.bind(this);
        this.insert = this.insert.bind(this);
        this.quill.root.addEventListener('drop', this.handleDrop, false);
        this.quill.root.addEventListener('paste', this.handlePaste, false);
    }
    /* handle image drop event
     */
    handleDrop(e) {
        e.preventDefault();
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
            if (document.caretRangeFromPoint) {
                const selection = document.getSelection();
                const range = document.caretRangeFromPoint(e.clientX, e.clientY);
                if (selection && range) {
                    selection.setBaseAndExtent(range.startContainer, range.startOffset, range.startContainer, range.startOffset);
                }
            }
            this.readFiles(e.dataTransfer.files, (dataUrl, type) => {
                type = type || 'image/png';
                if (typeof this.option.handler === 'function') {
                    this.option.handler.call(this, dataUrl, type, new ImageData(dataUrl, type));
                }
                else {
                    this.insert.call(this, utils.resolveDataUrl(dataUrl), type);
                }
            }, e);
        }
    }
    /* handle image paste event
     */
    handlePaste(e) {
        if (e.clipboardData && e.clipboardData.items && e.clipboardData.items.length) {
            if (utils.isHtmlText(e.clipboardData.items))
                return;
            this.readFiles(e.clipboardData.items, (dataUrl, type) => {
                type = type || 'image/png';
                if (typeof this.option.handler === 'function') {
                    this.option.handler.call(this, dataUrl, type, new ImageData(dataUrl, type));
                }
                else {
                    this.insert(utils.resolveDataUrl(dataUrl), 'image');
                }
            }, e);
        }
    }
    /* read the files
     */
    readFiles(files, callback, e) {
        Array.prototype.forEach.call(files, (file) => {
            if (file instanceof DataTransferItem) {
                this.handleDataTransfer(file, callback, e);
            }
            else if (file instanceof File) {
                this.handleDroppedFile(file, callback, e);
            }
        });
    }
    /* handle the pasted data
     */
    handleDataTransfer(file, callback, e) {
        const that = this;
        const type = file.type;
        if (type.match(/^image\/(gif|jpe?g|a?png|svg|webp|bmp)/i)) {
            e.preventDefault();
            const reader = new FileReader();
            reader.onload = (e) => {
                if (e.target && e.target.result) {
                    callback(e.target.result, type);
                }
            };
            const blob = file.getAsFile ? file.getAsFile() : file;
            if (blob instanceof Blob)
                reader.readAsDataURL(blob);
        }
        else if (type.match(/^text\/plain$/i)) {
            e.preventDefault();
            file.getAsString((s) => {
                utils
                    .urlIsImage(s)
                    .then(() => {
                    that.insert(s, 'image');
                })
                    .catch(() => {
                    that.insert(s, 'text');
                });
            });
        }
    }
    /* handle the dropped data
     */
    handleDroppedFile(file, callback, e) {
        const type = file.type;
        if (type.match(/^image\/(gif|jpe?g|a?png|svg|webp|bmp)/i)) {
            e.preventDefault();
            const reader = new FileReader();
            reader.onload = (e) => {
                if (e.target && e.target.result) {
                    callback(e.target.result, type);
                }
            };
            reader.readAsDataURL(file);
        }
    }
    /* insert into the editor
     */
    insert(content, type) {
        let index = (this.quill.getSelection(true) || {}).index;
        if (index === undefined || index < 0)
            index = this.quill.getLength();
        if (type === 'image') {
            const _index = index + 1;
            this.quill.insertEmbed(index, type, content, 'user');
            this.quill.setSelection(_index);
        }
        else if (type === 'text') {
            const _index = index + content.length;
            this.quill.insertText(index, content, 'user');
            this.quill.setSelection(_index);
        }
    }
}
ImageDropAndPaste.ImageData = ImageData;
window.QuillImageDropAndPaste = ImageDropAndPaste;
if ('Quill' in window) {
    window.Quill.register('modules/imageDropAndPaste', ImageDropAndPaste);
}

export { ImageData, ImageDropAndPaste as default };