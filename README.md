# StudioMerger

`StudioMerger` is a TypeScript library that allows you to merge various media sources, including audio files, video files, image files, and MediaStreams, into a single media output (MediaStream). 

It is designed to support multiple types of inputs, such as live audio/video streams, files, and captures from the screen, browser, or window.

## Features

- **Multi-Source Merging**: Combine multiple media sources like audio streams, video inputs, and image files.
- **Flexible Positioning**: Control the position and dimensions of each media source in the final output.
- **Type Safety**: Leveraging TypeScript's strong typing system for safer and more predictable code.
- **Works even on background tabs**: Uses `rxjs` to run even on background tabs managing asynchronous data streams.

## Installation

To install the package, use npm or yarn:

```bash
npm install studio-merger
// or
yarn add studio-merger
```

## Usage
Here’s a basic example of how to use StudioMerger:

```typescript
  import StudioMerger, { MergerSource, MergerOptions } from 'studio-merger';
  
  const options: MergerOptions = { debug: true };
  const studio = new StudioMerger(options);
  
  const videoSource: MergerSource = {
      id: 'sampleVideo', // OPTIONAL, package will provide an unique id for each source if it's not passed 
      name: 'Sample Video',
      type: 'visual', // 'visual': like image, video, camera stream, or screen stream | 'sound': like audio file, or mic stream.
      kind: 'videofile',
      source: await navigator.mediaDevices.getUserMedia({ video: true }),  // HTMLVideoElement or MediaStream
      position: { x: 0, y: 0, w: 640, h: 480 }, // OPTIONAL, if you don't pass positions, package will auto grid added 'visual' sources inside canvas
  };
  
  studio.addSource(videoSource);
```

As soon as you add your first source, either 'visual' or 'sound', StudioMerger will start working.

## API
`StudioMerger`

`constructor(options: MergerOptions)`
* Initializes a new instance of StudioMerger.
* Parameters:
  * options: An object containing configuration options. 
  * For now, it's only contains `debug`, If set to true, it will send capture and log WebGL errors. 
* `addSource(source: MergerSource): void`
  * Adds a new media source to the merger.
  * `source`: The media source to add, type of `MergerSource`.
    ```typescript
    type MergerSource = {
      id?: string;
      index?: number;
      source: MediaStream | HTMLImageElement | HTMLVideoElement | HTMLAudioElement;
      name: string;
      type: SourceType;
      kind: SourceKind;
      position?: MergerPosition;
    }
    ```
* `removeSource(id: string): void`
  * Remove a source
* `getSources()`
  * Returns the list of all added sources into merger
* `updateIndex(id: string, index: number)`
  * Updates the index of a visual source on canvas. Use it to push forward or backward the sources that are shown on each other.
* `updatePosition(id: string, position: MergerPosition)`
  * Updates the position of `visual` source on canvas.
* `setOutputSize(width: number, height: number)`
  * Updates the output size of canvas, `default` is 1920x1080.
* `destroy()`
  * Destroys the whole process of StudioMerger and release all sources.
  * Once destroyed, you can use it again. You will have to create a new studio, `new StudioMerger()`.

## Types

* `SourceType = 'visual' | 'sound';`
* `SourceKind = 'audioinput' | 'videoinput' | 'displaycapture' | 'windowcapture' | 'browsercapture' | 'videofile' | 'audiofile' | 'imagefile';`
* `MergerPosition = { x: number; y: number; w: number; h: number; };`
* `MergerSource`
  * Represents a media source to be merged.
  * Properties:
    * `id`: Optional, unique identifier for the source.
    * `index`: Optional, index of the source shown on canvas.
    * `name`: Name of the source.
    * `type`: `SourceType`, Type of the source, either visual or sound.
    * `kind`: `SourceKind`, Kind of source.
    * `position`: `MergerPosition`, 
      * Optional, Position and size of the source in the final output.
      * If not passed, The package will automatically calculate and add sources in grid style. 
  