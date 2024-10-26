import { TextureLoader } from './texture-loader.js';
import { Matrix4 } from './matrix4.js';
import { MaskManager } from './mask-manager.js';

export class FaceLandmarkRenderer {
    constructor() {
        this.device = null;
        this.context = null;
        this.pipeline = null;
        this.textureLoader = null;
        this.maskManager = null;
        this.matrix = new Matrix4();
    }


    async initialize(canvas) {
        if (!navigator.gpu) {
            throw new Error('WebGPU not supported');
        }

        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) {
            throw new Error('No appropriate GPUAdapter found');
        }

        this.device = await adapter.requestDevice();
        this.context = canvas.getContext('webgpu');

        if (!this.context) {
            throw new Error('Failed to get WebGPU context');
        }

        const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
        this.context.configure({
            device: this.device,
            format: canvasFormat,
            alphaMode: 'premultiplied',
        });

        await this.createPipeline(canvasFormat);
        return this;
    }
    cleanup() {
        if (this.device) {
            // Destroy any GPU resources
            this.device.destroy();
        }
    }

    async createPipeline(canvasFormat) {
        const vertexShader = `
            struct Uniforms {
                transform: mat4x4<f32>,
                properties: vec4<f32>,  // x: maskAlpha, y: flipHorizontal, z: maskEyeHole, w: unused
            }

            struct VertexInput {
                @location(0) position: vec3<f32>,
                @location(1) texCoord: vec2<f32>,
                @location(2) landmark: vec3<f32>,
                @location(3) vtxAlpha: f32,
            }

            struct VertexOutput {
                @builtin(position) position: vec4<f32>,
                @location(0) texCoord: vec2<f32>,
                @location(1) vtxAlpha: f32,
                @location(2) worldPos: vec3<f32>,
            }

            @group(0) @binding(0) var<uniform> uniforms: Uniforms;

            @vertex
            fn main(input: VertexInput) -> VertexOutput {
                var output: VertexOutput;
                
                // Apply face landmark deformation
                var pos = mix(input.position, input.landmark, uniforms.properties.w);
                
                // Apply horizontal flip if enabled
                if (uniforms.properties.y > 0.0) {
                    pos.x = -pos.x;
                }
                
                output.position = uniforms.transform * vec4<f32>(pos, 1.0);
                output.texCoord = input.texCoord;
                output.vtxAlpha = input.vtxAlpha;
                output.worldPos = pos;
                
                return output;
            }
        `;

        const fragmentShader = `
            struct Uniforms {
                transform: mat4x4<f32>,
                properties: vec4<f32>,  // x: maskAlpha, y: flipHorizontal, z: maskEyeHole, w: unused
            }

            @group(0) @binding(0) var<uniform> uniforms: Uniforms;
            @group(1) @binding(0) var texSampler: sampler;
            @group(1) @binding(1) var maskTexture: texture_2d<f32>;

            @fragment
            fn main(
                @location(0) texCoord: vec2<f32>,
                @location(1) vtxAlpha: f32,
                @location(2) worldPos: vec3<f32>
            ) -> @location(0) vec4<f32> {
                var color = textureSample(maskTexture, texSampler, texCoord);
                
                // Apply mask alpha
                color.a *= uniforms.properties.x * vtxAlpha;
                
                // Handle eye holes if enabled
                if (uniforms.properties.z > 0.0) {
                    // Calculate distance from eye centers (simplified)
                    let leftEyeCenter = vec2<f32>(-0.2, 0.0);
                    let rightEyeCenter = vec2<f32>(0.2, 0.0);
                    let eyeRadius = 0.1;
                    
                    let dLeft = distance(worldPos.xy, leftEyeCenter);
                    let dRight = distance(worldPos.xy, rightEyeCenter);
                    
                    if (dLeft < eyeRadius || dRight < eyeRadius) {
                        color.a = 0.0;
                    }
                }
                
                return color;
            }
        `;

        const pipeline = await this.device.createRenderPipeline({
            layout: 'auto',
            vertex: {
                module: this.device.createShaderModule({ code: vertexShader }),
                entryPoint: 'main',
                buffers: [{
                    arrayStride: 40, // 3 (pos) + 2 (uv) + 3 (landmark) + 1 (alpha) = 9 floats * 4 bytes
                    attributes: [
                        { format: 'float32x3', offset: 0, shaderLocation: 0 },  // position
                        { format: 'float32x2', offset: 12, shaderLocation: 1 }, // texCoord
                        { format: 'float32x3', offset: 20, shaderLocation: 2 }, // landmark
                        { format: 'float32', offset: 32, shaderLocation: 3 }    // vtxAlpha
                    ]
                }]
            },
            fragment: {
                module: this.device.createShaderModule({ code: fragmentShader }),
                entryPoint: 'main',
                targets: [{
                    format: canvasFormat,
                    blend: {
                        color: {
                            srcFactor: 'src-alpha',
                            dstFactor: 'one-minus-src-alpha',
                            operation: 'add'
                        },
                        alpha: {
                            srcFactor: 'one',
                            dstFactor: 'one-minus-src-alpha',
                            operation: 'add'
                        }
                    }
                }]
            },
            primitive: {
                topology: 'triangle-list',
                cullMode: 'back'
            },
            depthStencil: {
                depthWriteEnabled: true,
                depthCompare: 'less',
                format: 'depth24plus'
            }
        });

        this.pipeline = pipeline;
    }

    async render(facePredictions, properties) {
        const commandEncoder = this.device.createCommandEncoder();
        const activeMask = this.maskManager.getActiveMask();

        if (!activeMask || !facePredictions.length) {
            return;
        }

        // Update uniform buffer
        const uniforms = new Float32Array([
            ...this.matrix.elements,           // transform matrix
            properties.maskAlpha,              // maskAlpha
            properties.flipHorizontal ? 1 : 0, // flipHorizontal
            properties.maskEyeHole ? 1 : 0,    // maskEyeHole
            0                                  // unused
        ]);

        const uniformBuffer = this.device.createBuffer({
            size: uniforms.byteLength,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        this.device.queue.writeBuffer(uniformBuffer, 0, uniforms);

        // Create vertex buffer for each face
        for (const prediction of facePredictions) {
            const vertexData = this.createVertexData(prediction, activeMask.landmarks);
            const vertexBuffer = this.device.createBuffer({
                size: vertexData.byteLength,
                usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
            });
            this.device.queue.writeBuffer(vertexBuffer, 0, vertexData);

            // Begin render pass
            const renderPass = commandEncoder.beginRenderPass({
                colorAttachments: [{
                    view: this.context.getCurrentTexture().createView(),
                    clearValue: { r: 0, g: 0, b: 0, a: 0 },
                    loadOp: 'clear',
                    storeOp: 'store',
                }]
            });

            renderPass.setPipeline(this.pipeline);
            renderPass.setBindGroup(0, this.device.createBindGroup({
                layout: this.pipeline.getBindGroupLayout(0),
                entries: [{
                    binding: 0,
                    resource: { buffer: uniformBuffer }
                }]
            }));
            renderPass.setBindGroup(1, activeMask.bindGroup);
            renderPass.setVertexBuffer(0, vertexBuffer);
            renderPass.draw(vertexData.length / 10); // 10 floats per vertex
            renderPass.end();
        }

        this.device.queue.submit([commandEncoder.finish()]);
    }

    createVertexData(prediction, maskLandmarks) {
        // Combine face mesh vertices with texture coordinates and landmarks
        const vertices = new Float32Array(prediction.scaledMesh.length * 10);
        let offset = 0;

        for (let i = 0; i < prediction.scaledMesh.length; i++) {
            const pos = prediction.scaledMesh[i];
            const maskPos = maskLandmarks[i];
            const texCoord = this.getMeshUV(i);

            // Position
            vertices[offset++] = pos[0];
            vertices[offset++] = pos[1];
            vertices[offset++] = pos[2];

            // Texture coordinates
            vertices[offset++] = texCoord[0];
            vertices[offset++] = texCoord[1];

            // Landmark position (for morphing)
            vertices[offset++] = maskPos[0];
            vertices[offset++] = maskPos[1];
            vertices[offset++] = maskPos[2];

            // Vertex alpha
            vertices[offset++] = this.getVertexAlpha(i);
        }

        return vertices;
    }

    getMeshUV(index) {
        // Return UV coordinates for the face mesh
        // This would be based on your face mesh UV mapping
        return [0, 0]; // Placeholder - implement actual UV mapping
    }

    getVertexAlpha(index) {
        // Return alpha value for vertex based on its position in the face mesh
        // This could be used to fade out edges or create special effects
        return 1.0; // Placeholder - implement actual alpha calculation
    }
}