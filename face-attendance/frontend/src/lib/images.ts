export const MAX_SOURCE_IMAGE_MB = 50;
export const MAX_SOURCE_IMAGE_BYTES = MAX_SOURCE_IMAGE_MB * 1024 * 1024;
export const MAX_PROCESSED_IMAGE_BYTES = 700_000;
export const MAX_FACE_ENROLLMENT_IMAGES = 3;

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Unable to read processed image."));
      }
    };
    reader.onerror = () => reject(new Error("Unable to read processed image."));
    reader.readAsDataURL(blob);
  });
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("Unable to process image."));
        }
      },
      "image/jpeg",
      quality,
    );
  });
}

async function optimizeImageBlob(
  source: Blob,
  maxDimension: number,
): Promise<string> {
  if (!source.type.startsWith("image/")) {
    throw new Error("Upload a valid image file.");
  }
  if (source.size > MAX_SOURCE_IMAGE_BYTES) {
    throw new Error(
      `Image is too large. Use an image up to ${MAX_SOURCE_IMAGE_MB} MB.`,
    );
  }

  const bitmap = await createImageBitmap(source, { imageOrientation: "from-image" });
  try {
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Image processing is unavailable in this browser.");
    }
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    for (const quality of [0.86, 0.76, 0.66]) {
      const blob = await canvasToJpeg(canvas, quality);
      if (blob.size <= MAX_PROCESSED_IMAGE_BYTES) {
        return blobToDataUrl(blob);
      }
    }
    throw new Error("Image could not be reduced below 700 KB.");
  } finally {
    bitmap.close();
  }
}

export async function optimizeImageFile(
  file: File,
  maxDimension = 1024,
): Promise<string> {
  return optimizeImageBlob(file, maxDimension);
}

export async function optimizeImageDataUrl(
  dataUrl: string,
  maxDimension = 1024,
): Promise<string> {
  const response = await fetch(dataUrl);
  if (!response.ok) {
    throw new Error("Unable to process captured image.");
  }
  return optimizeImageBlob(await response.blob(), maxDimension);
}
