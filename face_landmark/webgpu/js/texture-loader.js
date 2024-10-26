export class TextureLoader {
    constructor(device) {
        this.device = device;
        this.supportedFormats = ['image/jpeg', 'image/png', 'image/webp'];
        this.maxTextureSize = this.getMaxTextureSize();
        this.fallbackTexture = null;
    }

    static async initialize(device) {
        const loader = new TextureLoader(device);
        await loader.initializeFallbackTexture();
        return loader;
    }

    getMaxTextureSize() {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl');
        return gl ? gl.getParameter(gl.MAX_TEXTURE_SIZE) : 4096;
    }

    async initializeFallbackTexture() {
        // Create a simple colored pattern as fallback
        const size = 256;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        // Create a simple pattern
        ctx.fillStyle = '#444444';
        ctx.fillRect(0, 0, size, size);
        ctx.fillStyle = '#666666';
        for (let i = 0; i < size; i += 32) {
            for (let j = 0; j < size; j += 32) {
                if ((i + j) % 64 === 0) {
                    ctx.fillRect(i, j, 32, 32);
                }
            }
        }

        // Add text indicating it's a fallback
        ctx.fillStyle = '#ffffff';
        ctx.font = '20px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Fallback Texture', size/2, size/2);

        const imageData = await createImageBitmap(canvas);
        this.fallbackTexture = await this.createTextureFromImage(imageData, true);
    }

    async validateImage(image) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                resolve({
                    valid: true,
                    width: img.width,
                    height: img.height,
                    aspectRatio: img.width / img.height
                });
            };
            img.onerror = () => {
                resolve({ valid: false });
            };
            img.src = typeof image === 'string' ? image : URL.createObjectURL(image);
        });
    }

    async loadImage(url) {
        try {
            const response = await fetch(url, {
                mode: 'cors',
                credentials: 'omit'
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const blob = await response.blob();
            const format = blob.type;

            // Handle JPG specifically - convert to grayscale if needed
            if (format === 'image/jpeg') {
                return await this.convertJpgToMask(blob);
            }

            // For PNG, use directly
            const imageBitmap = await createImageBitmap(blob, {
                premultiplyAlpha: 'premultiply',
                colorSpaceConversion: 'default'
            });

            return await this.createTextureFromBitmap(imageBitmap);

        } catch (error) {
            console.error(`Failed to load image from ${url}:`, error);
            return await this.createFallbackTexture();
     
        }
    }
    async convertJpgToMask(blob) {
        // Create a canvas to process the JPG
        const img = await createImageBitmap(blob);
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');

        // Draw the image
        ctx.drawImage(img, 0, 0);

        // Convert to grayscale if it's a mask
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        // Convert to grayscale and use as alpha
        for (let i = 0; i < data.length; i += 4) {
            const gray = (data[i] + data[i + 1] + data[i + 2]) / 3;
            // Set RGB to white and use grayscale as alpha
            data[i] = 255;     // R
            data[i + 1] = 255; // G
            data[i + 2] = 255; // B
            data[i + 3] = gray;// A
        }

        ctx.putImageData(imageData, 0, 0);
        const processedBitmap = await createImageBitmap(canvas);
        return await this.createTextureFromBitmap(processedBitmap);
    }

    async createTextureFromBitmap(imageBitmap) {
        const texture = this.device.createTexture({
            size: [imageBitmap.width, imageBitmap.height],
            format: 'rgba8unorm',
            usage: GPUTextureUsage.TEXTURE_BINDING | 
                   GPUTextureUsage.COPY_DST | 
                   GPUTextureUsage.RENDER_ATTACHMENT
        });

        this.device.queue.copyExternalImageToTexture(
            { source: imageBitmap },
            { texture: texture },
            [imageBitmap.width, imageBitmap.height]
        );

        const sampler = this.device.createSampler({
            magFilter: 'linear',
            minFilter: 'linear',
            mipmapFilter: 'linear',
        });

        return {
            texture,
            sampler,
            width: imageBitmap.width,
            height: imageBitmap.height
        };
    }

    async createFallbackTexture() {
        // Create a simple colored pattern
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');

        // Fill with a gradient
        const gradient = ctx.createLinearGradient(0, 0, 256, 256);
        gradient.addColorStop(0, '#444444');
        gradient.addColorStop(1, '#666666');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 256, 256);

        // Create texture from canvas
        const imageBitmap = await createImageBitmap(canvas);
        
        const texture = this.device.createTexture({
            size: [256, 256],
            format: 'rgba8unorm',
            usage: GPUTextureUsage.TEXTURE_BINDING | 
                   GPUTextureUsage.COPY_DST | 
                   GPUTextureUsage.RENDER_ATTACHMENT
        });

        this.device.queue.copyExternalImageToTexture(
            { source: imageBitmap },
            { texture: texture },
            [256, 256]
        );

        const sampler = this.device.createSampler({
            magFilter: 'linear',
            minFilter: 'linear',
            mipmapFilter: 'linear',
        });

        return {
            texture,
            sampler,
            width: 256,
            height: 256,
            isFallback: true
        };
    }

    async loadAndResizeImage(source, maxSize) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const img = await this.loadImageElement(source);

        // Calculate new dimensions
        let width = img.width;
        let height = img.height;
        if (width > height) {
            if (width > maxSize) {
                height *= maxSize / width;
                width = maxSize;
            }
        } else {
            if (height > maxSize) {
                width *= maxSize / height;
                height = maxSize;
            }
        }

        // Resize
        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);

        const imageData = await createImageBitmap(canvas);
        return this.createTextureFromImage(imageData);
    }

    async loadImageElement(source) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = typeof source === 'string' ? source : URL.createObjectURL(source);
        });
    }

    async createTextureFromImage(imageBitmap, isFallback = false) {
        try {
            // Create texture
            const texture = this.device.createTexture({
                size: {
                    width: imageBitmap.width,
                    height: imageBitmap.height,
                    depthOrArrayLayers: 1,
                },
                format: 'rgba8unorm',
                usage: GPUTextureUsage.TEXTURE_BINDING | 
                       GPUTextureUsage.COPY_DST | 
                       GPUTextureUsage.RENDER_ATTACHMENT,
                label: isFallback ? 'fallback-texture' : 'mask-texture'
            });

            // Copy image data to texture
            this.device.queue.copyExternalImageToTexture(
                { source: imageBitmap },
                { texture: texture },
                [imageBitmap.width, imageBitmap.height]
            );

            // Create sampler
            const sampler = this.device.createSampler({
                magFilter: 'linear',
                minFilter: 'linear',
                mipmapFilter: 'linear',
                addressModeU: 'clamp-to-edge',
                addressModeV: 'clamp-to-edge',
            });

            return {
                texture,
                sampler,
                width: imageBitmap.width,
                height: imageBitmap.height,
                isFallback
            };
        } catch (error) {
            console.error('Failed to create texture from image', error);
            throw error;
        }
    }

    // Cleanup method
    destroy() {
        if (this.fallbackTexture) {
            this.fallbackTexture.texture.destroy();
            this.fallbackTexture = null;
        }
    }
}