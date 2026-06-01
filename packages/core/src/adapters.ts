/**
 * Represents an image-like object with dimensions.
 * Abstracted to support environment-agnostic image handling (e.g., HTMLImageElement in browsers or canvas Image in Node.js).
 */
export interface ImageLike {
  /** The width of the image in pixels. */
  readonly width: number;
  /** The height of the image in pixels. */
  readonly height: number;
}

/**
 * Represents an image data-like object containing raw pixel data and dimensions.
 * Mirrors the standard browser ImageData structure.
 */
export interface ImageDataLike {
  /** The raw pixel data in RGBA order (red, green, blue, alpha). */
  readonly data: Uint8ClampedArray;
  /** The width of the image data in pixels. */
  readonly width: number;
  /** The height of the image data in pixels. */
  readonly height: number;
}

/**
 * Minimal environment-agnostic interface for a 2D rendering context.
 * Abstracted to support both HTMLCanvasElement's `CanvasRenderingContext2D` and Node-Canvas `CanvasRenderingContext2D`.
 */
export interface Context2DLike {
  /**
   * Draws an image or canvas at the specified coordinates.
   *
   * @param image - The source image or canvas to draw.
   * @param dx - The X coordinate in the destination canvas at which to place the top-left corner of the source image.
   * @param dy - The Y coordinate in the destination canvas at which to place the top-left corner of the source image.
   */
  drawImage(image: ImageLike | CanvasLike, dx: number, dy: number): void;
  /**
   * Draws an image or canvas at the specified coordinates, scaling it to the specified dimensions.
   *
   * @param image - The source image or canvas to draw.
   * @param dx - The X coordinate in the destination canvas at which to place the top-left corner of the source image.
   * @param dy - The Y coordinate in the destination canvas at which to place the top-left corner of the source image.
   * @param dw - The width to draw the image in the destination canvas.
   * @param dh - The height to draw the image in the destination canvas.
   */
  drawImage(
    image: ImageLike | CanvasLike,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ): void;
  /**
   * Draws a specified region of a source image or canvas onto a specified region of the destination canvas.
   *
   * @param image - The source image or canvas to draw.
   * @param sx - The X coordinate of the top-left corner of the sub-rectangle of the source image to draw.
   * @param sy - The Y coordinate of the top-left corner of the sub-rectangle of the source image to draw.
   * @param sw - The width of the sub-rectangle of the source image to draw.
   * @param sh - The height of the sub-rectangle of the source image to draw.
   * @param dx - The X coordinate in the destination canvas at which to place the top-left corner of the source image.
   * @param dy - The Y coordinate in the destination canvas at which to place the top-left corner of the source image.
   * @param dw - The width to draw the image in the destination canvas.
   * @param dh - The height to draw the image in the destination canvas.
   */
  drawImage(
    image: ImageLike | CanvasLike,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ): void;
  /**
   * Returns an ImageData object representing the underlying pixel data for the specified portion of the canvas.
   *
   * @param sx - The X coordinate of the upper-left corner of the rectangle from which the ImageData will be extracted.
   * @param sy - The Y coordinate of the upper-left corner of the rectangle from which the ImageData will be extracted.
   * @param sw - The width of the rectangle from which the ImageData will be extracted.
   * @param sh - The height of the rectangle from which the ImageData will be extracted.
   * @returns An object containing raw pixel data and dimensions.
   */
  getImageData(sx: number, sy: number, sw: number, sh: number): ImageDataLike;
  /**
   * Paints data from the given ImageData object onto the canvas.
   *
   * @param imageData - An ImageData object containing the array of pixel values.
   * @param dx - The X coordinate in the destination canvas at which to place the image data.
   * @param dy - The Y coordinate in the destination canvas at which to place the image data.
   */
  putImageData(imageData: ImageDataLike, dx: number, dy: number): void;
  /**
   * Sets all pixels in the rectangle defined by starting point (x, y) and size (w, h) to transparent black, erasing any previously drawn content.
   *
   * @param x - The X coordinate of the starting point of the rectangle.
   * @param y - The Y coordinate of the starting point of the rectangle.
   * @param w - The width of the rectangle.
   * @param h - The height of the rectangle.
   */
  clearRect(x: number, y: number, w: number, h: number): void;
}

/**
 * Represents a canvas-like object containing dimensions and a 2D rendering context.
 * Abstracted to support both HTMLCanvasElement in browsers and Canvas in Node.js.
 */
export interface CanvasLike {
  /** The width of the canvas in pixels. */
  readonly width: number;
  /** The height of the canvas in pixels. */
  readonly height: number;
  /**
   * Returns a 2D drawing context on the canvas.
   *
   * @param contextId - The identifier of the context to retrieve. Must be '2d'.
   * @returns A 2D rendering context.
   */
  getContext(contextId: '2d'): Context2DLike;
}

/**
 * An adapter interface providing canvas creation and image loading capabilities.
 * Callers of @lpc-toolkit/core must provide an implementation of this interface
 * to make the core composition logic environment-agnostic (e.g. BrowserCanvasAdapter vs NodeCanvasAdapter).
 */
export interface CanvasAdapter {
  /**
   * Creates a new CanvasLike instance with the specified dimensions.
   *
   * @param width - The width of the canvas to create.
   * @param height - The height of the canvas to create.
   * @returns A new canvas instance.
   */
  createCanvas(width: number, height: number): CanvasLike;
  /**
   * Loads an image from the specified path or URL.
   *
   * @param path - The path or URL of the image to load.
   * @returns A promise resolving to the loaded ImageLike instance.
   */
  loadImage(path: string): Promise<ImageLike>;
}
