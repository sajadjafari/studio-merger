import {interval, Subscription} from 'rxjs';
import AudioMerger from 'audio-merger';
import {nanoid} from 'nanoid';

export type SourceType = 'visual' | 'sound';
export type SourceKind =
    'audioinput'
    | 'videoinput'
    | 'displaycapture'
    | 'windowcapture'
    | 'browsercapture'
    | 'videofile'
    | 'audiofile'
    | 'imagefile';

export type MergerOptions = {
    debug: boolean;
}

export type MergerPosition = { x: number; y: number; w: number; h: number; };

export type MergerSource = {
    id?: string;
    index?: number;
    source: MediaStream | HTMLImageElement | HTMLVideoElement | HTMLAudioElement;
    name: string;
    type: SourceType;
    kind: SourceKind;
    position?: MergerPosition;
}

export type SourceItem = {
    id: string;
    index: number;
    source: MediaStream | HTMLImageElement | HTMLVideoElement;
    element: HTMLVideoElement | HTMLImageElement | null;
    vertices: Float32Array;
    position: MergerPosition;
};

export default class StudioMerger {
    public canvas: HTMLCanvasElement;

    readonly gl: WebGL2RenderingContext;

    readonly program: WebGLProgram;

    readonly debug: boolean;

    public width: number = 1920;

    public height: number = 1080;

    public fps: number = 40;

    public isRendering: boolean = false;

    public result: MediaStream;

    private sources: Map<string, SourceItem> = new Map();

    public destroyed = false;

    private rxIntervalSub: Subscription | null = null;

    public mixer: AudioMerger | null = null;

    constructor(options?: MergerOptions) {
        this.debug = options?.debug || false;
        // Check for support
        const canvas = document.createElement('canvas');
        if (!('AudioContext' in window && 'createMediaElementSource' in AudioContext.prototype))
            throw 'AudioContext is not supported!';
        if (!canvas.captureStream)
            throw 'Canvas is not supported!';
        if (!canvas.getContext('webgl2'))
            throw 'WebGL is not supported!';

        this.canvas = document.createElement('canvas');
        this.canvas.width = this.width;
        this.canvas.height = this.height;
        this.canvas.addEventListener('webglcontextlost', (e: Event) => console.error(e), false);
        this.gl = this.canvas.getContext('webgl2', {
            alpha: false,
            premultipliedAlpha: false,
            antialias: true,
            preserveDrawingBuffer: false,
            powerPreference: 'default',
        }) as WebGL2RenderingContext;
        // Set viewport
        this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);

        // Create shaders
        const vertexShaderSource = `#version 300 es
            layout(location=0) in vec2 aPosition;
            layout(location=1) in vec2 aTextCoords;
            out vec2 vTextCoords;
            void main() {
                vTextCoords = aTextCoords;
                gl_Position = vec4(aPosition, 0.0, 1.0);
            }
        `;
        const fragmentShaderSource = `#version 300 es
            precision mediump float;
            uniform sampler2D uSampler;
            in vec2 vTextCoords;
            out vec4 fragColor;
            void main() {
                fragColor = texture(uSampler, vTextCoords);
            }
        `;

        this.program = this.gl.createProgram() as WebGLProgram;
        // Add shader Source, Compile, and Attach to Program
        // Vertex shader
        const vertexShader = this.gl.createShader(this.gl.VERTEX_SHADER) as WebGLShader;
        this.gl.shaderSource(vertexShader, vertexShaderSource);
        this.gl.compileShader(vertexShader);
        this.gl.attachShader(this.program, vertexShader);
        // Fragment shader
        const fragmentShader = this.gl.createShader(this.gl.FRAGMENT_SHADER) as WebGLShader;
        this.gl.shaderSource(fragmentShader, fragmentShaderSource);
        this.gl.compileShader(fragmentShader);
        this.gl.attachShader(this.program, fragmentShader);
        // Link program
        this.gl.linkProgram(this.program);

        if (this.debug) {
            const debugInfo = this.gl.getExtension('WEBGL_debug_renderer_info');
            if (debugInfo) {
                const vendor = this.gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
                const renderer = this.gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
                console.log(`DEBUG_INFO: Vendor: ${vendor}, Renderer: ${renderer}`, debugInfo);
            }
            if (!this.gl.getShaderParameter(vertexShader, this.gl.COMPILE_STATUS))
                console.error(`ERROR compiling vertex shader!`, this.gl.getShaderInfoLog(vertexShader));
            if (!this.gl.getShaderParameter(fragmentShader, this.gl.COMPILE_STATUS))
                console.error(`ERROR compiling fragment shader!`, this.gl.getShaderInfoLog(fragmentShader));
            if (!this.gl.getProgramParameter(this.program, this.gl.LINK_STATUS))
                console.error('Error linking program:', this.gl.getProgramInfoLog(this.program));
        }

        // Attach program
        this.gl.useProgram(this.program);

        // Bind texCoordsBuffer
        const texCoordsBuffer = this.gl.createBuffer();
        const texCoordsBufferData = new Float32Array([0, 1, 0, 0, 1, 1, 1, 0]);
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, texCoordsBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, texCoordsBufferData, this.gl.STATIC_DRAW);
        this.gl.vertexAttribPointer(1, 2, this.gl.FLOAT, false, 0, 0);
        this.gl.enableVertexAttribArray(1);
        // Bind texture
        const texture = this.gl.createTexture();
        this.gl.uniform1i(this.gl.getUniformLocation(this.program, 'uSampler'), 0);
        this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.NEAREST);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.MIRRORED_REPEAT);

        // Flip the picture
        this.gl.pixelStorei(this.gl.UNPACK_FLIP_Y_WEBGL, true);

        this.result = this.canvas.captureStream(this.fps);
    }

    private getPosition(position?: MergerPosition): MergerPosition {
        if (position) return position;
        const size = this.sources.size + 1;
        const gridSize = Math.ceil(Math.sqrt(size));
        const w = Math.floor(this.canvas.width / gridSize);
        const h = Math.floor(this.canvas.height / gridSize);
        const axis = (index: number) => {
            const row = Math.floor(index / gridSize);
            const col = index % gridSize;
            return {x: col * w, y: row * h};
        };

        if (this.sources.size) {
            [...this.sources].forEach(([, source], index) => {
                if (index < this.sources.size) {
                    this.updatePosition(source.id, {...axis(index), w, h});
                }
            });
        }
        return {...axis(this.sources.size), w, h};
    }

    private translatePositionToVertices = (position?: MergerPosition): Float32Array => {
        const {width, height} = this.canvas;
        const {x: posX, y: posY, w: posW, h: posH} = this.getPosition(position);
        const pixelX = 2 / width;
        const pixelY = 2 / height;
        const x1 = pixelX * posX - 1;
        const x2 = pixelX * (posX + posW) - 1;
        const y1 = pixelY * (height - posY) - 1;
        const y2 = pixelY * (height - (posY + posH)) - 1;
        return new Float32Array([x1, y1, x1, y2, x2, y1, x2, y2]); // topLeft (2), bottomLeft (2), topRight (2), bottomRight (2)
    };

    private createVideoElement(stream: MediaStream): HTMLVideoElement {
        const video = document.createElement('video');
        video.muted = true;
        video.style.position = 'absolute';
        video.style.top = '0';
        video.style.left = '0';
        video.style.opacity = '0';
        video.srcObject = stream as MediaStream;
        video.play().catch(err => {
            console.error('Merger failed to add stream', err);
        });
        return video;
    }

    private draw() {
        try {
            this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
            this.gl.clearDepth(this.gl.getParameter(this.gl.DEPTH_CLEAR_VALUE));
            this.gl.clearColor(0, 0, 0, 0);
            if (!this.isRendering) {
                if (this.rxIntervalSub?.unsubscribe) this.rxIntervalSub.unsubscribe();
                return;
            }
            this.sources.forEach(({element, vertices}) => {
                if (!element || (element instanceof HTMLVideoElement && element.readyState < 3)) return;
                const vertexBuffer = this.gl.createBuffer();
                this.gl.bindBuffer(this.gl.ARRAY_BUFFER, vertexBuffer);
                this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.STATIC_DRAW);
                this.gl.vertexAttribPointer(0, 2, this.gl.FLOAT, false, 2 * 4, 0);
                this.gl.enableVertexAttribArray(0);
                this.gl.texImage2D(
                    this.gl.TEXTURE_2D,
                    0,
                    this.gl.RGB,
                    element instanceof HTMLVideoElement ? element.videoWidth : element.width,
                    element instanceof HTMLVideoElement ? element.videoHeight : element.height,
                    0,
                    this.gl.RGB,
                    this.gl.UNSIGNED_BYTE,
                    element,
                );
                this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
                this.gl.deleteBuffer(vertexBuffer);
            });
        } catch (err) {
            console.error(err);
        }
    }

    private start() {
        this.isRendering = true;
        this.rxIntervalSub = interval(1000 / this.fps).subscribe(() => this.draw());
    }

    addSource({id: sourceId, index, name, source, position, type}: MergerSource) {
        const id = sourceId || nanoid();
        if (this.destroyed) {
            throw 'StudioMerger: Merger has been destroyed, Please create a new instance!';
        }
        if (!this.mixer) this.mixer = new AudioMerger();
        if (!this.result?.getAudioTracks().length) {
            this.result.addTrack(this.mixer.getOutputStream().getAudioTracks()[0]);
        }
        // Add Audio
        if (source instanceof MediaStream && (type === 'sound' || source.getAudioTracks().length > 0)) {
            this.mixer.addSource(name, source);
        }
        if (type === 'sound' && source instanceof HTMLMediaElement) {
            source.id = id;
            void source.play();
            this.mixer.addSource(name, source);
        }
        // Add Video
        if (type === 'visual') {
            const id = sourceId || (source instanceof MediaStream ? source.id : nanoid());
            if (!(source instanceof MediaStream)) {
                source.id = id;
            }
            if (source instanceof HTMLVideoElement) {
                void source.play();
            }
            this.sources.set(source.id, {
                id,
                index: index || this.sources.size,
                source: source as MediaStream | HTMLImageElement | HTMLVideoElement,
                vertices: this.translatePositionToVertices(position),
                position: this.getPosition(position),
                element: source instanceof MediaStream
                    ? this.createVideoElement(source)
                    : source as HTMLImageElement | HTMLVideoElement,
            });
        }
        if (!this.isRendering && this.sources.size || this.mixer.getSources().size) this.start();
    }

    removeStream(id: string) {
        // Delete sound
        if (this.mixer && this.mixer.getSources().has(id)) {
            this.mixer.removeSource(id);
        }
        // Remove visual
        const source = this.sources.get(id);
        if (source) {
            if (source.element) source.element.remove();
            if (source.source instanceof MediaStream) {
                source.source.getTracks().forEach((track: MediaStreamTrack) => {
                    track.enabled = false;
                    track.stop();
                    (source.source as MediaStream).removeTrack(track);
                })
            }
            this.sources.delete(id);
        }
        // Clear canvas if there is no stream to draw;
        if (!this.sources.size) {
            setTimeout(() => {
                if (this.gl) {
                    this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
                    this.gl.clearDepth(this.gl.getParameter(this.gl.DEPTH_CLEAR_VALUE));
                }
            }, 50);
        }
    }

    getSources(): Readonly<Array<SourceItem>> {
        const sources: Array<SourceItem> = [];
        this.sources.forEach((source: SourceItem) => sources.push(Object.freeze(source)));
        return Object.freeze(sources);
    }

    updateIndex(id: string, index: number) {
        const stream = this.sources.get(id);
        if (stream) {
            this.sources.set(id, {...stream, index});
            this.sortSources();
        }
    }

    updatePosition(id: string, position: MergerPosition) {
        const source = this.sources.get(id);
        if (source) {
            this.sources.set(id, {
                ...source,
                vertices: this.translatePositionToVertices(position),
            });
        }
    }

    // Sources visual source by index
    private sortSources() {
        const streams = Array.from(this.sources);
        if (streams.length) {
            this.sources = new Map(streams.sort((a, b) => a[1].index - b[1].index));
        }
    }

    setOutputSize(width: number, height: number) {
        this.width = width;
        this.height = height;
        this.canvas.setAttribute('width', width.toString());
        this.canvas.setAttribute('height', height.toString());
        this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    }

    destroy() {
        // Remove all visual sources
        for (const [id] of Array.from(this.sources)) {
            this.removeStream(id);
        }
        // Remove all sound sources inside Mixer
        if (this.mixer) {
            for (const [id] of Array.from(this.mixer?.getSources() || new Map())) {
                this.mixer.removeSource(id);
            }
        }
        if (this.mixer) this.mixer.destroy();
        this.sources = new Map();
        this.isRendering = false;
        this.canvas.remove();
        this.rxIntervalSub = null;
        this.result.getTracks().forEach((track: MediaStreamTrack) => {
            track.enabled = false;
            track.stop();
            this.result.removeTrack(track);
        });
        this.destroyed = true;
    }
}