import AudioMerger from 'audio-merger';

type SourceType = 'visual' | 'sound';
type SourceKind = 'audioinput' | 'videoinput' | 'displaycapture' | 'windowcapture' | 'browsercapture' | 'videofile' | 'audiofile' | 'imagefile';
type MergerOptions = {
    debug: boolean;
};
type MergerPosition = {
    x: number;
    y: number;
    w: number;
    h: number;
};
type MergerSource = {
    id?: string;
    index?: number;
    source: MediaStream | HTMLImageElement | HTMLVideoElement | HTMLAudioElement;
    name: string;
    type: SourceType;
    kind: SourceKind;
    position?: MergerPosition;
};
type SourceItem = {
    id: string;
    index: number;
    source: MediaStream | HTMLImageElement | HTMLVideoElement;
    element: HTMLVideoElement | HTMLImageElement | null;
    vertices: Float32Array;
    position: MergerPosition;
};
declare class StudioMerger {
    canvas: HTMLCanvasElement;
    readonly gl: WebGL2RenderingContext;
    readonly program: WebGLProgram;
    readonly debug: boolean;
    width: number;
    height: number;
    fps: number;
    isRendering: boolean;
    result: MediaStream;
    private sources;
    destroyed: boolean;
    private rxIntervalSub;
    mixer: AudioMerger | null;
    constructor(options?: MergerOptions);
    getPosition(position?: MergerPosition): MergerPosition;
    translatePositionToVertices: (position?: MergerPosition) => Float32Array;
    updatePosition(mediaStream: MediaStream | string, position: MergerPosition): void;
    private createVideoElement;
    draw(): void;
    start(): void;
    addSource({ id: sourceId, index, name, source, position, type }: MergerSource): void;
    removeStream(id: string): void;
    getSources(): Readonly<Array<SourceItem>>;
    updateIndex(id: string, index: number): void;
    private sortSources;
    setOutputSize(width: number, height: number): void;
    destroy(): void;
}

export { type MergerOptions, type MergerPosition, type MergerSource, type SourceKind, type SourceType, StudioMerger as default };
