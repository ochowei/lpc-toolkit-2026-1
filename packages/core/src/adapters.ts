export interface ImageLike {
  readonly width: number;
  readonly height: number;
}

export interface ImageDataLike {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
}

export interface Context2DLike {
  drawImage(image: ImageLike | CanvasLike, dx: number, dy: number): void;
  drawImage(
    image: ImageLike | CanvasLike,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ): void;
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
  getImageData(sx: number, sy: number, sw: number, sh: number): ImageDataLike;
  putImageData(imageData: ImageDataLike, dx: number, dy: number): void;
  clearRect(x: number, y: number, w: number, h: number): void;
}

export interface CanvasLike {
  readonly width: number;
  readonly height: number;
  getContext(contextId: '2d'): Context2DLike;
}

export interface CanvasAdapter {
  createCanvas(width: number, height: number): CanvasLike;
  loadImage(path: string): Promise<ImageLike>;
}
