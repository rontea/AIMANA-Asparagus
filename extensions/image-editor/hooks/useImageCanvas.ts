import React, { useState, useRef, useCallback, useEffect } from 'react';

interface FilterState {
    brightness: number;
    contrast: number;
    saturate: number;
    grayscale: number;
    invert: number;
    sepia: number;
    blur: number;
    hueRotate: number;
    temperature: number;
    tint: number;
    vibrance: number;
    highlights: number;
    shadows: number;
    clarity: number;
    vignette: number;
    grain: number;
}

export const DEFAULT_FILTERS: FilterState = {
    brightness: 100,
    contrast: 100,
    saturate: 100,
    grayscale: 0,
    invert: 0,
    sepia: 0,
    blur: 0,
    hueRotate: 0,
    temperature: 0,
    tint: 0,
    vibrance: 0,
    highlights: 0,
    shadows: 0,
    clarity: 0,
    vignette: 0,
    grain: 0
};

interface CropRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

interface ResizeRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

interface ImageTransformState {
    x: number;
    y: number;
    scale: number;
}

interface EditorSnapshot {
    imageSrc: string | null;
    filters: FilterState;
    rotation: number;
    flipH: boolean;
    flipV: boolean;
    imageTransform: ImageTransformState;
}

interface SnapshotHistoryEntry {
    id: string;
    label: string;
    createdAt: number;
    snapshot: EditorSnapshot;
}

export interface GridItem {
    id: string;
    url: string;
    img: HTMLImageElement;
}

type DragHandle = 'tl' | 'tr' | 'bl' | 'br' | 't' | 'b' | 'l' | 'r' | 'move' | 'paint' | 'pan' | 'move-image' | null;

export const useImageCanvas = () => {
    const MAX_HISTORY = 20;
    const MAX_SNAPSHOT_HISTORY = 20;
    const canvasElRef = useRef<HTMLCanvasElement>(null);
    const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const [image, setImage] = useState<HTMLImageElement | null>(null);
    const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
    const [rotation, setRotation] = useState(0);
    const [flipH, setFlipH] = useState(false);
    const [flipV, setFlipV] = useState(false);
    const [zoom, setZoom] = useState(1);
    const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
    const [isPanning, setIsPanning] = useState(false);
    const [isSpaceHeld, setIsSpaceHeld] = useState(false);
    const [currentDimensions, setCurrentDimensions] = useState({ width: 0, height: 0 });

    // Grid / Matrix State
    const [isGridMode, setIsGridMode] = useState(false);
    const [gridCols, setGridCols] = useState(4);
    const [gridRows, setGridRows] = useState(2);
    const [gridGutter, setGridGutter] = useState(10);
    const [gridCellWidth, setGridCellWidth] = useState(1024);
    const [gridCellHeight, setGridCellHeight] = useState(1024);
    const [gridItems, setGridItems] = useState<Record<number, GridItem>>({});
    const [hoveredSlot, setHoveredSlot] = useState<number | null>(null);

    // Inpainting State
    const [isInpainting, setIsInpainting] = useState(false);
    const [brushSize, setBrushSize] = useState(40);
    const [isEraser, setIsEraser] = useState(false);

    // Cropping State
    const [isCropping, setIsCropping] = useState(false);
    const [cropRect, setCropRect] = useState<CropRect | null>(null);
    const [isResizingImage, setIsResizingImage] = useState(false);
    const [resizeRect, setResizeRect] = useState<ResizeRect | null>(null);
    const [isTransforming, setIsTransforming] = useState(false);
    const [imageTransform, setImageTransform] = useState<ImageTransformState>({ x: 0, y: 0, scale: 1 });
    const [activeHandle, setActiveHandle] = useState<string | null>(null);
    const dragMode = useRef<DragHandle>(null);
    const lastMousePos = useRef({ x: 0, y: 0 });
    const lastGlobalMousePos = useRef({ x: 0, y: 0 });
    const transformDragStartRef = useRef<{ centerX: number; centerY: number } | null>(null);
    const historyRef = useRef<EditorSnapshot[]>([]);
    const historyIndexRef = useRef(-1);
    const isRestoringRef = useRef(false);
    const historyDebounceRef = useRef<any>(null);
    const pendingHistoryLabelRef = useRef<string | undefined>(undefined);
    const [canUndo, setCanUndo] = useState(false);
    const [canRedo, setCanRedo] = useState(false);
    const [snapshotHistory, setSnapshotHistory] = useState<SnapshotHistoryEntry[]>([]);

    const clampCropRectToCanvas = useCallback((rect: CropRect, canvasW: number, canvasH: number): CropRect => {
        const width = Math.max(20, Math.min(rect.width, canvasW));
        const height = Math.max(20, Math.min(rect.height, canvasH));
        const x = Math.max(0, Math.min(rect.x, canvasW - width));
        const y = Math.max(0, Math.min(rect.y, canvasH - height));
        return { x, y, width, height };
    }, []);

    const syncHistoryAvailability = useCallback(() => {
        setCanUndo(historyIndexRef.current > 0);
        setCanRedo(historyIndexRef.current >= 0 && historyIndexRef.current < historyRef.current.length - 1);
    }, []);

    const createSnapshot = useCallback((): EditorSnapshot => ({
        imageSrc: image?.src || null,
        filters: { ...filters },
        rotation,
        flipH,
        flipV,
        imageTransform: { ...imageTransform }
    }), [image, filters, rotation, flipH, flipV, imageTransform]);

    const snapshotsEqual = useCallback((a: EditorSnapshot, b: EditorSnapshot) => (
        JSON.stringify(a) === JSON.stringify(b)
    ), []);

    const appendSnapshotHistory = useCallback((snapshot: EditorSnapshot, label?: string) => {
        const now = Date.now();
        const resolvedLabel = label?.trim() || 'Refine update';
        const entry: SnapshotHistoryEntry = {
            id: `snap-${now}-${Math.random().toString(36).slice(2, 7)}`,
            label: resolvedLabel,
            createdAt: now,
            snapshot
        };

        setSnapshotHistory(prev => {
            if (prev.length > 0 && snapshotsEqual(prev[0].snapshot, snapshot)) return prev;
            return [entry, ...prev].slice(0, MAX_SNAPSHOT_HISTORY);
        });
    }, [snapshotsEqual]);

    const pushHistorySnapshot = useCallback((snapshot?: EditorSnapshot, label?: string) => {
        if (isGridMode || isRestoringRef.current) return;
        const next = snapshot || createSnapshot();
        const current = historyRef.current[historyIndexRef.current];
        if (current && JSON.stringify(current) === JSON.stringify(next)) return;

        const branch = historyRef.current.slice(0, historyIndexRef.current + 1);
        branch.push(next);
        while (branch.length > MAX_HISTORY) branch.shift();

        historyRef.current = branch;
        historyIndexRef.current = historyRef.current.length - 1;
        syncHistoryAvailability();
        appendSnapshotHistory(next, label);
    }, [isGridMode, createSnapshot, syncHistoryAvailability, appendSnapshotHistory]);

    const scheduleHistorySnapshot = useCallback((label?: string) => {
        if (label?.trim()) pendingHistoryLabelRef.current = label.trim();
        if (historyDebounceRef.current) clearTimeout(historyDebounceRef.current);
        historyDebounceRef.current = setTimeout(() => {
            pushHistorySnapshot(undefined, pendingHistoryLabelRef.current);
            pendingHistoryLabelRef.current = undefined;
        }, 220);
    }, [pushHistorySnapshot]);

    const resetHistoryWithSnapshot = useCallback((snapshot: EditorSnapshot) => {
        historyRef.current = [snapshot];
        historyIndexRef.current = 0;
        syncHistoryAvailability();
    }, [syncHistoryAvailability]);

    const ensureMaskCanvas = useCallback((width: number, height: number) => {
        if (!maskCanvasRef.current) {
            maskCanvasRef.current = document.createElement('canvas');
        }
        if (maskCanvasRef.current.width !== width || maskCanvasRef.current.height !== height) {
            maskCanvasRef.current.width = width;
            maskCanvasRef.current.height = height;
            const ctx = maskCanvasRef.current.getContext('2d');
            if (ctx) {
                ctx.clearRect(0, 0, width, height);
            }
        }
    }, []);

    const loadImage = useCallback(async (src: string, isCrossDomain: boolean = false, resetHistory: boolean = true) => {
        return new Promise<HTMLImageElement>((resolve) => {
            const img = new Image();
            if (isCrossDomain) img.crossOrigin = "anonymous";
            img.src = src;
            img.onload = () => {
                if (!isGridMode) {
                    setImage(img);
                    setFilters(DEFAULT_FILTERS);
                    setRotation(0);
                    setFlipH(false);
                    setFlipV(false);
                    setZoom(1);
                    setPanOffset({ x: 0, y: 0 });
                    setIsCropping(false);
                    setCropRect(null);
                    setIsTransforming(false);
                    setImageTransform({ x: 0, y: 0, scale: 1 });
                    setCurrentDimensions({ width: img.width, height: img.height });
                    ensureMaskCanvas(img.width, img.height);
                    if (resetHistory) {
                        resetHistoryWithSnapshot({
                            imageSrc: img.src,
                            filters: { ...DEFAULT_FILTERS },
                            rotation: 0,
                            flipH: false,
                            flipV: false,
                            imageTransform: { x: 0, y: 0, scale: 1 }
                        });
                    }
                }
                resolve(img);
            };
        });
    }, [isGridMode, ensureMaskCanvas, resetHistoryWithSnapshot]);

    const applyPanDelta = useCallback((deltaX: number, deltaY: number) => {
        if (!canvasElRef.current) return;
        const canvas = canvasElRef.current;
        const viewport = canvas.closest('[data-lab-viewport-root="true"]') as HTMLElement | null;
        const viewportWidth = viewport?.clientWidth || canvas.width;
        const viewportHeight = viewport?.clientHeight || canvas.height;
        const scaledWidth = canvas.width * zoom;
        const scaledHeight = canvas.height * zoom;

        // Camera bounds: no pan when content fits in viewport, bounded pan when zoomed/larger.
        const maxPanX = Math.max(0, (scaledWidth - viewportWidth) / 2);
        const maxPanY = Math.max(0, (scaledHeight - viewportHeight) / 2);

        setPanOffset(prev => ({
            x: Math.max(-maxPanX, Math.min(maxPanX, prev.x + deltaX)),
            y: Math.max(-maxPanY, Math.min(maxPanY, prev.y + deltaY))
        }));
    }, [zoom]);

    const clamp255 = (value: number) => Math.max(0, Math.min(255, value));

    const applyAdvancedAdjustments = useCallback((ctx: CanvasRenderingContext2D, targetWidth: number, targetHeight: number) => {
        const {
            temperature,
            tint,
            vibrance,
            highlights,
            shadows,
            clarity,
            vignette,
            grain
        } = filters;

        const hasAdvancedAdjustments =
            temperature !== 0 ||
            tint !== 0 ||
            vibrance !== 0 ||
            highlights !== 0 ||
            shadows !== 0 ||
            clarity !== 0 ||
            vignette !== 0 ||
            grain !== 0;

        if (!hasAdvancedAdjustments) return;

        const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);
        const data = imageData.data;
        const centerX = targetWidth / 2;
        const centerY = targetHeight / 2;
        const maxDistance = Math.sqrt((centerX * centerX) + (centerY * centerY)) || 1;

        const t = temperature / 100;
        const tn = tint / 100;
        const vib = vibrance / 100;
        const high = highlights / 100;
        const shad = shadows / 100;
        const clar = clarity / 100;
        const vignetteStrength = vignette / 100;
        const grainStrength = grain / 100;

        for (let i = 0; i < data.length; i += 4) {
            let r = data[i];
            let g = data[i + 1];
            let b = data[i + 2];

            // Temperature / tint bias.
            r += (t * 36) + (tn * 16);
            g -= tn * 22;
            b -= (t * 36) + (tn * 16);

            const maxRGB = Math.max(r, g, b);
            const minRGB = Math.min(r, g, b);
            const saturation = maxRGB === 0 ? 0 : (maxRGB - minRGB) / maxRGB;
            const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

            // Vibrance boosts low-saturated pixels first.
            if (vib !== 0) {
                const satFactor = (1 - saturation) * vib * 0.7;
                const avg = (r + g + b) / 3;
                r += (r - avg) * satFactor;
                g += (g - avg) * satFactor;
                b += (b - avg) * satFactor;
            }

            // Highlight / shadow tone shaping.
            if (high !== 0) {
                const highlightWeight = luminance * luminance;
                const delta = 255 * high * 0.35 * highlightWeight;
                r += delta;
                g += delta;
                b += delta;
            }

            if (shad !== 0) {
                const shadowWeight = (1 - luminance) * (1 - luminance);
                const delta = 255 * shad * 0.35 * shadowWeight;
                r += delta;
                g += delta;
                b += delta;
            }

            // Midtone contrast.
            if (clar !== 0) {
                const midtoneWeight = 1 - Math.abs((luminance - 0.5) * 2);
                const clarityGain = clar * 0.55 * midtoneWeight;
                r += (r - 128) * clarityGain;
                g += (g - 128) * clarityGain;
                b += (b - 128) * clarityGain;
            }

            // Vignette / grain post pass.
            if (vignetteStrength > 0 || grainStrength > 0) {
                const px = (i / 4) % targetWidth;
                const py = Math.floor((i / 4) / targetWidth);
                const dx = px - centerX;
                const dy = py - centerY;
                const distance = Math.sqrt((dx * dx) + (dy * dy)) / maxDistance;

                if (vignetteStrength > 0) {
                    const vignetteFactor = Math.max(0.25, 1 - (distance * distance * vignetteStrength * 0.9));
                    r *= vignetteFactor;
                    g *= vignetteFactor;
                    b *= vignetteFactor;
                }

                if (grainStrength > 0) {
                    const noiseSeed = Math.sin((i + 1) * 12.9898) * 43758.5453;
                    const noise = (noiseSeed - Math.floor(noiseSeed)) - 0.5;
                    const grainDelta = noise * grainStrength * 50;
                    r += grainDelta;
                    g += grainDelta;
                    b += grainDelta;
                }
            }

            data[i] = clamp255(r);
            data[i + 1] = clamp255(g);
            data[i + 2] = clamp255(b);
        }

        ctx.putImageData(imageData, 0, 0);
    }, [filters]);

    const drawBaseToContext = useCallback((ctx: CanvasRenderingContext2D, targetWidth: number, targetHeight: number) => {
        if (!image) return;
        
        ctx.clearRect(0, 0, targetWidth, targetHeight);
        
        ctx.filter = `
            brightness(${filters.brightness}%) 
            contrast(${filters.contrast}%) 
            saturate(${filters.saturate}%) 
            grayscale(${filters.grayscale}%) 
            invert(${filters.invert}%)
            sepia(${filters.sepia}%)
            blur(${filters.blur}px)
            hue-rotate(${filters.hueRotate}deg)
        `;

        ctx.save();
        ctx.translate((targetWidth / 2) + imageTransform.x, (targetHeight / 2) + imageTransform.y);
        ctx.rotate((rotation * Math.PI) / 180);
        ctx.scale((flipH ? -1 : 1) * imageTransform.scale, (flipV ? -1 : 1) * imageTransform.scale);
        ctx.drawImage(image, -image.width / 2, -image.height / 2);
        ctx.restore();
        ctx.filter = 'none';
        applyAdvancedAdjustments(ctx, targetWidth, targetHeight);
    }, [image, filters, rotation, flipH, flipV, imageTransform, applyAdvancedAdjustments]);

    const draw = useCallback(() => {
        if (!canvasElRef.current) return;
        const canvas = canvasElRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        if (isGridMode) {
            const cellW = gridCellWidth;
            const cellH = gridCellHeight;
            const totalW = (cellW * gridCols) + (gridGutter * (gridCols - 1));
            const totalH = (cellH * gridRows) + (gridGutter * (gridRows - 1));

            if (canvas.width !== totalW || canvas.height !== totalH) {
                canvas.width = totalW;
                canvas.height = totalH;
                setCurrentDimensions({ width: totalW, height: totalH });
            }

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#050505';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            for (let r = 0; r < gridRows; r++) {
                for (let c = 0; c < gridCols; c++) {
                    const idx = (r * gridCols) + c;
                    const item = gridItems[idx];
                    const x = c * (cellW + gridGutter);
                    const y = r * (cellH + gridGutter);

                    if (item) {
                        ctx.drawImage(item.img, x, y, cellW, cellH);
                    } else {
                        ctx.fillStyle = '#0a0a0a';
                        ctx.fillRect(x, y, cellW, cellH);
                        ctx.strokeStyle = 'rgba(99, 102, 241, 0.1)';
                        ctx.lineWidth = 4;
                        ctx.setLineDash([20, 20]);
                        ctx.strokeRect(x + 20, y + 20, cellW - 40, cellH - 40);
                        ctx.setLineDash([]);
                        ctx.fillStyle = 'rgba(255,255,255,0.05)';
                        ctx.font = `black ${Math.min(cellW, cellH) / 8}px Inter, sans-serif`;
                        ctx.textAlign = 'center';
                        ctx.fillText(`${idx + 1}`, x + cellW/2, y + cellH/2 + (Math.min(cellW, cellH) / 20));
                    }

                    // Hover Highlight for D&D
                    if (hoveredSlot === idx) {
                        ctx.save();
                        ctx.strokeStyle = '#6366f1';
                        ctx.lineWidth = 12;
                        ctx.globalAlpha = 0.6;
                        ctx.strokeRect(x, y, cellW, cellH);
                        ctx.fillStyle = 'rgba(99, 102, 241, 0.1)';
                        ctx.fillRect(x, y, cellW, cellH);
                        ctx.restore();
                    }
                }
            }
        } else if (image) {
            const isRotated = (rotation / 90) % 2 !== 0;
            const width = isRotated ? image.height : image.width;
            const height = isRotated ? image.width : image.height;

            if (canvas.width !== width || canvas.height !== height) {
                canvas.width = width;
                canvas.height = height;
                setCurrentDimensions({ width, height });
                ensureMaskCanvas(width, height);
            }

            drawBaseToContext(ctx, canvas.width, canvas.height);

            // Draw Mask Overlay
            if (maskCanvasRef.current) {
                ctx.save();
                ctx.globalAlpha = 0.5;
                ctx.fillStyle = '#ffffff'; 
                ctx.drawImage(maskCanvasRef.current, 0, 0);
                ctx.restore();
            }

            if (isCropping && cropRect) {
                ctx.save();
                
                ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
                ctx.fillRect(0, 0, canvas.width, cropRect.y);
                ctx.fillRect(0, cropRect.y + cropRect.height, canvas.width, canvas.height - (cropRect.y + cropRect.height));
                ctx.fillRect(0, cropRect.y, cropRect.x, cropRect.height);
                ctx.fillRect(cropRect.x + cropRect.width, cropRect.y, canvas.width - (cropRect.x + cropRect.width), cropRect.height);

                ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
                ctx.lineWidth = 1 / zoom;
                ctx.beginPath();
                ctx.moveTo(cropRect.x + cropRect.width / 3, cropRect.y);
                ctx.lineTo(cropRect.x + cropRect.width / 3, cropRect.y + cropRect.height);
                ctx.moveTo(cropRect.x + (cropRect.width / 3) * 2, cropRect.y);
                ctx.lineTo(cropRect.x + (cropRect.width / 3) * 2, cropRect.y + cropRect.height);
                ctx.moveTo(cropRect.x, cropRect.y + cropRect.height / 3);
                ctx.lineTo(cropRect.x + cropRect.width, cropRect.y + cropRect.height / 3);
                ctx.moveTo(cropRect.x, cropRect.y + (cropRect.height / 3) * 2);
                ctx.lineTo(cropRect.x + cropRect.width, cropRect.y + (cropRect.height / 3) * 2); 
                ctx.stroke();

                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 1.5 / zoom;
                ctx.strokeRect(cropRect.x, cropRect.y, cropRect.width, cropRect.height);

                const hSize = 15 / zoom;
                const hThick = 4 / zoom;
                ctx.fillStyle = '#fff';

                ctx.fillRect(cropRect.x - hThick/2, cropRect.y - hThick/2, hSize, hThick);
                ctx.fillRect(cropRect.x - hThick/2, cropRect.y - hThick/2, hThick, hSize);
                ctx.fillRect(cropRect.x + cropRect.width - hSize + hThick/2, cropRect.y - hThick/2, hSize, hThick);
                ctx.fillRect(cropRect.x + cropRect.width - hThick/2, cropRect.y - hThick/2, hThick, hSize);
                ctx.fillRect(cropRect.x - hThick/2, cropRect.y + cropRect.height - hThick/2, hSize, hThick);
                ctx.fillRect(cropRect.x - hThick/2, cropRect.y + cropRect.height - hSize + hThick/2, hThick, hSize);
                ctx.fillRect(cropRect.x + cropRect.width - hSize + hThick/2, cropRect.y + cropRect.height - hThick/2, hSize, hThick);
                ctx.fillRect(cropRect.x + cropRect.width - hThick/2, cropRect.y + cropRect.height - hSize + hThick/2, hThick, hSize);
                
                ctx.fillRect(cropRect.x + cropRect.width / 2 - hSize / 2, cropRect.y - hThick / 2, hSize, hThick);
                ctx.fillRect(cropRect.x + cropRect.width / 2 - hSize / 2, cropRect.y + cropRect.height - hThick / 2, hSize, hThick);
                ctx.fillRect(cropRect.x - hThick / 2, cropRect.y + cropRect.height / 2 - hSize / 2, hThick, hSize);
                ctx.fillRect(cropRect.x + cropRect.width - hThick / 2, cropRect.y + cropRect.height / 2 - hSize / 2, hThick, hSize);

                ctx.restore();
            }

            if (isResizingImage && resizeRect) {
                ctx.save();
                ctx.strokeStyle = '#22d3ee';
                ctx.lineWidth = 1.5 / zoom;
                ctx.setLineDash([8 / zoom, 8 / zoom]);
                ctx.strokeRect(resizeRect.x, resizeRect.y, resizeRect.width, resizeRect.height);
                ctx.setLineDash([]);

                const hSize = 14 / zoom;
                const hThick = 4 / zoom;
                ctx.fillStyle = '#22d3ee';

                ctx.fillRect(resizeRect.x - hThick/2, resizeRect.y - hThick/2, hSize, hThick);
                ctx.fillRect(resizeRect.x - hThick/2, resizeRect.y - hThick/2, hThick, hSize);
                ctx.fillRect(resizeRect.x + resizeRect.width - hSize + hThick/2, resizeRect.y - hThick/2, hSize, hThick);
                ctx.fillRect(resizeRect.x + resizeRect.width - hThick/2, resizeRect.y - hThick/2, hThick, hSize);
                ctx.fillRect(resizeRect.x - hThick/2, resizeRect.y + resizeRect.height - hThick/2, hSize, hThick);
                ctx.fillRect(resizeRect.x - hThick/2, resizeRect.y + resizeRect.height - hSize + hThick/2, hThick, hSize);
                ctx.fillRect(resizeRect.x + resizeRect.width - hSize + hThick/2, resizeRect.y + resizeRect.height - hThick/2, hSize, hThick);
                ctx.fillRect(resizeRect.x + resizeRect.width - hThick/2, resizeRect.y + resizeRect.height - hSize + hThick/2, hThick, hSize);

                ctx.fillRect(resizeRect.x + resizeRect.width / 2 - hSize / 2, resizeRect.y - hThick / 2, hSize, hThick);
                ctx.fillRect(resizeRect.x + resizeRect.width / 2 - hSize / 2, resizeRect.y + resizeRect.height - hThick / 2, hSize, hThick);
                ctx.fillRect(resizeRect.x - hThick / 2, resizeRect.y + resizeRect.height / 2 - hSize / 2, hThick, hSize);
                ctx.fillRect(resizeRect.x + resizeRect.width - hThick / 2, resizeRect.y + resizeRect.height / 2 - hSize / 2, hThick, hSize);
                ctx.restore();
            }

            if (isTransforming) {
                const displayW = image.width * imageTransform.scale;
                const displayH = image.height * imageTransform.scale;
                const cx = (canvas.width / 2) + imageTransform.x;
                const cy = (canvas.height / 2) + imageTransform.y;
                const rx = cx - (displayW / 2);
                const ry = cy - (displayH / 2);

                ctx.save();
                ctx.strokeStyle = '#22d3ee';
                ctx.lineWidth = 1.5 / zoom;
                ctx.setLineDash([8 / zoom, 8 / zoom]);
                ctx.strokeRect(rx, ry, displayW, displayH);
                ctx.setLineDash([]);

                const hSize = 14 / zoom;
                const hThick = 4 / zoom;
                ctx.fillStyle = '#22d3ee';

                ctx.fillRect(rx - hThick / 2, ry - hThick / 2, hSize, hThick);
                ctx.fillRect(rx - hThick / 2, ry - hThick / 2, hThick, hSize);
                ctx.fillRect(rx + displayW - hSize + hThick / 2, ry - hThick / 2, hSize, hThick);
                ctx.fillRect(rx + displayW - hThick / 2, ry - hThick / 2, hThick, hSize);
                ctx.fillRect(rx - hThick / 2, ry + displayH - hThick / 2, hSize, hThick);
                ctx.fillRect(rx - hThick / 2, ry + displayH - hSize + hThick / 2, hThick, hSize);
                ctx.fillRect(rx + displayW - hSize + hThick / 2, ry + displayH - hThick / 2, hSize, hThick);
                ctx.fillRect(rx + displayW - hThick / 2, ry + displayH - hSize + hThick / 2, hThick, hSize);
                ctx.restore();
            }
        }
    }, [image, filters, rotation, flipH, flipV, isCropping, cropRect, isResizingImage, resizeRect, isTransforming, imageTransform, zoom, isGridMode, gridCols, gridRows, gridGutter, gridCellWidth, gridCellHeight, gridItems, hoveredSlot, drawBaseToContext, ensureMaskCanvas]);

    useEffect(() => {
        draw();
    }, [draw]);

    useEffect(() => {
        return () => {
            if (historyDebounceRef.current) clearTimeout(historyDebounceRef.current);
        };
    }, []);

    const clampZoom = (value: number) => Math.max(0.1, Math.min(4, value));

    const applySnapshot = useCallback(async (snapshot: EditorSnapshot) => {
        if (!snapshot.imageSrc) return;
        isRestoringRef.current = true;
        try {
            if (!image || image.src !== snapshot.imageSrc) {
                await new Promise<void>((resolve) => {
                    const img = new Image();
                    img.src = snapshot.imageSrc!;
                    img.onload = () => {
                        setImage(img);
                        setCurrentDimensions({ width: img.width, height: img.height });
                        ensureMaskCanvas(img.width, img.height);
                        resolve();
                    };
                    img.onerror = () => resolve();
                });
            }
            setFilters(snapshot.filters);
            setRotation(snapshot.rotation);
            setFlipH(snapshot.flipH);
            setFlipV(snapshot.flipV);
            setImageTransform(snapshot.imageTransform);
            setIsCropping(false);
            setCropRect(null);
            setIsResizingImage(false);
            setResizeRect(null);
            setIsTransforming(false);
        } finally {
            isRestoringRef.current = false;
        }
    }, [image, ensureMaskCanvas]);

    const undo = useCallback(async () => {
        if (isGridMode || historyIndexRef.current <= 0) return;
        historyIndexRef.current -= 1;
        await applySnapshot(historyRef.current[historyIndexRef.current]);
        syncHistoryAvailability();
    }, [isGridMode, applySnapshot, syncHistoryAvailability]);

    const redo = useCallback(async () => {
        if (isGridMode || historyIndexRef.current >= historyRef.current.length - 1) return;
        historyIndexRef.current += 1;
        await applySnapshot(historyRef.current[historyIndexRef.current]);
        syncHistoryAvailability();
    }, [isGridMode, applySnapshot, syncHistoryAvailability]);

    const restoreSnapshot = useCallback(async (id: string) => {
        const entry = snapshotHistory.find(s => s.id === id);
        if (!entry) return;
        await applySnapshot(entry.snapshot);
        pushHistorySnapshot(entry.snapshot);
    }, [snapshotHistory, applySnapshot, pushHistorySnapshot]);

    // Keyboard navigation/editing shortcuts (Photoshop-inspired)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
            
            const PAN_STEP = 60 / zoom; // Standardized panning velocity
            const ZOOM_STEP = 0.1;
            const isMod = e.ctrlKey || e.metaKey;

            if (isMod && e.code === 'KeyZ' && !e.shiftKey) {
                e.preventDefault();
                void undo();
                return;
            }
            if ((isMod && e.code === 'KeyZ' && e.shiftKey) || (isMod && e.code === 'KeyY')) {
                e.preventDefault();
                void redo();
                return;
            }
            
            if (e.code === 'Space') {
                if (!e.repeat) setIsSpaceHeld(true);
                e.preventDefault(); // Stop viewport bounce
            }

            // Photoshop-like zoom shortcuts:
            // Ctrl/Cmd + "+" => zoom in
            // Ctrl/Cmd + "-" => zoom out
            // Ctrl/Cmd + "0" => fit view (reset)
            // Ctrl/Cmd + "1" => 100%
            if (isMod && (e.code === 'Equal' || e.code === 'NumpadAdd')) {
                e.preventDefault();
                setZoom(prev => clampZoom(prev + ZOOM_STEP));
                return;
            }
            if (isMod && (e.code === 'Minus' || e.code === 'NumpadSubtract')) {
                e.preventDefault();
                setZoom(prev => clampZoom(prev - ZOOM_STEP));
                return;
            }
            if (isMod && e.code === 'Digit0') {
                e.preventDefault();
                setZoom(1);
                setPanOffset({ x: 0, y: 0 });
                return;
            }
            if (isMod && e.code === 'Digit1') {
                e.preventDefault();
                setZoom(1);
                return;
            }

            // Photoshop-style free transform toggle.
            if (e.code === 'KeyT' && !isMod) {
                e.preventDefault();
                setIsTransforming(prev => !prev);
                setIsCropping(false);
                setCropRect(null);
                setIsResizingImage(false);
                setResizeRect(null);
                return;
            }

            // Brush size shortcuts (Photoshop-style brackets) while inpainting.
            if (isInpainting && (e.code === 'BracketLeft' || e.code === 'BracketRight')) {
                e.preventDefault();
                setBrushSize(prev => {
                    if (e.code === 'BracketLeft') return Math.max(1, prev - 2);
                    return Math.min(300, prev + 2);
                });
                return;
            }
            
            if (isTransforming) {
                const NUDGE_STEP = 10;
                if (e.code === 'KeyW' || e.code === 'ArrowUp') { e.preventDefault(); setImageTransform(prev => ({ ...prev, y: prev.y - NUDGE_STEP })); scheduleHistorySnapshot('Transform: move up'); }
                if (e.code === 'KeyS' || e.code === 'ArrowDown') { e.preventDefault(); setImageTransform(prev => ({ ...prev, y: prev.y + NUDGE_STEP })); scheduleHistorySnapshot('Transform: move down'); }
                if (e.code === 'KeyA' || e.code === 'ArrowLeft') { e.preventDefault(); setImageTransform(prev => ({ ...prev, x: prev.x - NUDGE_STEP })); scheduleHistorySnapshot('Transform: move left'); }
                if (e.code === 'KeyD' || e.code === 'ArrowRight') { e.preventDefault(); setImageTransform(prev => ({ ...prev, x: prev.x + NUDGE_STEP })); scheduleHistorySnapshot('Transform: move right'); }
                return;
            }

            // Standard Viewport WASD Directions (W = Up, S = Down, A = Left, D = Right)
            if (e.code === 'KeyW') applyPanDelta(0, PAN_STEP);
            if (e.code === 'KeyS') applyPanDelta(0, -PAN_STEP);
            if (e.code === 'KeyA') applyPanDelta(PAN_STEP, 0);
            if (e.code === 'KeyD') applyPanDelta(-PAN_STEP, 0);

            // Arrow keys pan too, for users who prefer navigation keys.
            if (e.code === 'ArrowUp') { e.preventDefault(); applyPanDelta(0, PAN_STEP); }
            if (e.code === 'ArrowDown') { e.preventDefault(); applyPanDelta(0, -PAN_STEP); }
            if (e.code === 'ArrowLeft') { e.preventDefault(); applyPanDelta(PAN_STEP, 0); }
            if (e.code === 'ArrowRight') { e.preventDefault(); applyPanDelta(-PAN_STEP, 0); }
        };
        
        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.code === 'Space') setIsSpaceHeld(false);
        };
        
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [zoom, isInpainting, isTransforming, undo, redo, scheduleHistorySnapshot, applyPanDelta]);

    const clearMask = useCallback(() => {
        if (maskCanvasRef.current) {
            const ctx = maskCanvasRef.current.getContext('2d');
            if (ctx) {
                ctx.clearRect(0, 0, maskCanvasRef.current.width, maskCanvasRef.current.height);
                draw();
            }
        }
    }, [draw]);

    const getHandleForRect = useCallback((rect: { x: number; y: number; width: number; height: number } | null, mouseX: number, mouseY: number) => {
        if (!rect) return null;
        const hitSize = 25 / zoom;
        const { x, y, width: w, height: h } = rect;

        if (mouseX >= x - hitSize && mouseX <= x + hitSize && mouseY >= y - hitSize && mouseY <= y + hitSize) return 'tl';
        if (mouseX >= x + w - hitSize && mouseX <= x + w + hitSize && mouseY >= y - hitSize && mouseY <= y + hitSize) return 'tr';
        if (mouseX >= x - hitSize && mouseX <= x + hitSize && mouseY >= y + h - hitSize && mouseY <= y + h + hitSize) return 'bl';
        if (mouseX >= x + w - hitSize && mouseX <= x + w + hitSize && mouseY >= y + h - hitSize && mouseY <= y + h + hitSize) return 'br';
        if (mouseX >= x + w/4 && mouseX <= x + (3*w)/4 && mouseY >= y - hitSize && mouseY <= y + hitSize) return 't';
        if (mouseX >= x + w/4 && mouseX <= x + (3*w)/4 && mouseY >= y + h - hitSize && mouseY <= y + h + hitSize) return 'b';
        if (mouseX >= x - hitSize && mouseX <= x + hitSize && mouseY >= y + h/4 && mouseY <= y + (3*h)/4) return 'l';
        if (mouseX >= x + w - hitSize && mouseX <= x + w + hitSize && mouseY >= y + h/4 && mouseY <= y + (3*h)/4) return 'r';
        if (mouseX >= x && mouseX <= x + w && mouseY >= y && mouseY <= y + h) return 'move';
        return null;
    }, [zoom]);

    const getHandleAt = useCallback((mouseX: number, mouseY: number) => {
        return getHandleForRect(cropRect, mouseX, mouseY);
    }, [cropRect, getHandleForRect]);

    const getTransformHandleAt = useCallback((mouseX: number, mouseY: number) => {
        if (!canvasElRef.current || !image) return null;
        const canvas = canvasElRef.current;
        const displayW = image.width * imageTransform.scale;
        const displayH = image.height * imageTransform.scale;
        const rect = {
            x: (canvas.width / 2) + imageTransform.x - (displayW / 2),
            y: (canvas.height / 2) + imageTransform.y - (displayH / 2),
            width: displayW,
            height: displayH
        };
        return getHandleForRect(rect, mouseX, mouseY);
    }, [image, imageTransform, getHandleForRect]);

    const getSlotAt = useCallback((mouseX: number, mouseY: number) => {
        if (!isGridMode) return null;
        const c = Math.floor(mouseX / (gridCellWidth + gridGutter));
        const r = Math.floor(mouseY / (gridCellHeight + gridGutter));
        if (c >= 0 && c < gridCols && r >= 0 && r < gridRows) {
            // Validate if coordinate is within the cell, not the gutter
            const internalX = mouseX % (gridCellWidth + gridGutter);
            const internalY = mouseY % (gridCellHeight + gridGutter);
            if (internalX <= gridCellWidth && internalY <= gridCellHeight) {
                return (r * gridCols) + c;
            }
        }
        return null;
    }, [isGridMode, gridCellWidth, gridCellHeight, gridCols, gridRows, gridGutter]);

    const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
        if (!canvasElRef.current) return;
        const canvas = canvasElRef.current;
        const rect = canvas.getBoundingClientRect();
        
        const mouseX = (e.clientX - rect.left) * (canvas.width / rect.width);
        const mouseY = (e.clientY - rect.top) * (canvas.height / rect.height);

        if (isSpaceHeld) {
            dragMode.current = 'pan';
            setIsPanning(true);
        } else if (isTransforming) {
            const handle = getTransformHandleAt(mouseX, mouseY) as DragHandle;
            dragMode.current = handle || null;
            setActiveHandle(handle);
            if (handle && handle !== 'move') {
                transformDragStartRef.current = {
                    centerX: (canvas.width / 2) + imageTransform.x,
                    centerY: (canvas.height / 2) + imageTransform.y
                };
            } else {
                transformDragStartRef.current = null;
            }
        } else if (isInpainting) {
            dragMode.current = 'paint';
            const mCtx = maskCanvasRef.current?.getContext('2d');
            if (mCtx) {
                mCtx.lineWidth = brushSize;
                mCtx.lineCap = 'round';
                mCtx.lineJoin = 'round';
                mCtx.strokeStyle = '#ffffff';
                mCtx.globalCompositeOperation = isEraser ? 'destination-out' : 'source-over';
                mCtx.beginPath();
                mCtx.moveTo(mouseX, mouseY);
            }
        } else if (isCropping && cropRect) {
            const handle = getHandleAt(mouseX, mouseY) as any;
            dragMode.current = handle;
            setActiveHandle(handle);
        } else if (isResizingImage && resizeRect) {
            const handle = getHandleForRect(resizeRect, mouseX, mouseY) as any;
            dragMode.current = handle;
            setActiveHandle(handle);
        } else {
            // Contextual Fallback: Panning
            dragMode.current = 'pan';
            setIsPanning(true);
        }
        
        lastMousePos.current = { x: mouseX, y: mouseY };
        lastGlobalMousePos.current = { x: e.clientX, y: e.clientY };
    }, [isInpainting, isCropping, cropRect, getHandleAt, brushSize, isEraser, isSpaceHeld, isTransforming, imageTransform, isResizingImage, resizeRect, getHandleForRect, getTransformHandleAt]);

    const handleCanvasMouseMove = useCallback((e: React.MouseEvent) => {
        if (!canvasElRef.current) return;
        const canvas = canvasElRef.current;
        const rect = canvas.getBoundingClientRect();
        
        const mouseX = (e.clientX - rect.left) * (canvas.width / rect.width);
        const mouseY = (e.clientY - rect.top) * (canvas.height / rect.height);

        if (dragMode.current === 'paint') {
            const mCtx = maskCanvasRef.current?.getContext('2d');
            if (mCtx) {
                mCtx.lineTo(mouseX, mouseY);
                mCtx.stroke();
                draw();
            }
        } else if (dragMode.current === 'pan') {
            const dx = e.clientX - lastGlobalMousePos.current.x;
            const dy = e.clientY - lastGlobalMousePos.current.y;
            applyPanDelta(dx, dy);
        } else if (isTransforming && dragMode.current === 'move') {
            const dx = mouseX - lastMousePos.current.x;
            const dy = mouseY - lastMousePos.current.y;
            setImageTransform(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
        } else if (isTransforming && dragMode.current) {
            const mode = dragMode.current;
            if (mode !== 'move' && mode !== 'move-image') {
                const start = transformDragStartRef.current;
                if (start && image) {
                    const halfW = Math.max(1, image.width / 2);
                    const halfH = Math.max(1, image.height / 2);
                    const dx = Math.abs(mouseX - start.centerX);
                    const dy = Math.abs(mouseY - start.centerY);
                    const scaleX = dx / halfW;
                    const scaleY = dy / halfH;
                    let nextScale = imageTransform.scale;

                    if (mode === 'l' || mode === 'r') nextScale = scaleX;
                    else if (mode === 't' || mode === 'b') nextScale = scaleY;
                    else nextScale = Math.max(scaleX, scaleY);

                    setImageTransform(prev => ({ ...prev, scale: Math.max(0.1, Math.min(4, nextScale)) }));
                }
            }
        } else if (isCropping && cropRect) {
            if (!dragMode.current) {
                const handle = getHandleAt(mouseX, mouseY);
                setActiveHandle(handle);
            } else {
                const dx = mouseX - lastMousePos.current.x;
                const dy = mouseY - lastMousePos.current.y;

                setCropRect(prev => {
                    if (!prev) return null;
                    let { x, y, width, height } = prev;

                    const mode = dragMode.current;
                    if (mode === 'move') { x += dx; y += dy; }
                    else if (mode === 'tl') { x += dx; y += dy; width -= dx; height -= dy; }
                    else if (mode === 'tr') { y += dy; width += dx; height -= dy; }
                    else if (mode === 'bl') { x += dx; width -= dx; height += dy; }
                    else if (mode === 'br') { width += dx; height += dy; }
                    else if (mode === 't') { y += dy; height -= dy; }
                    else if (mode === 'b') { height += dy; }
                    else if (mode === 'l') { x += dx; width -= dx; }
                    else if (mode === 'r') { width += dx; }

                    const minSize = 20;
                    if (width < minSize) {
                        if (mode === 'tl' || mode === 'bl' || mode === 'l') x = prev.x + prev.width - minSize;
                        width = minSize;
                    }
                    if (height < minSize) {
                        if (mode === 'tl' || mode === 'tr' || mode === 't') y = prev.y + prev.height - minSize;
                        height = minSize;
                    }

                    return clampCropRectToCanvas({ x, y, width, height }, canvas.width, canvas.height);
                });
            }
        } else if (isResizingImage && resizeRect) {
            if (!dragMode.current) {
                const handle = getHandleForRect(resizeRect, mouseX, mouseY);
                setActiveHandle(handle);
            } else {
                const dx = mouseX - lastMousePos.current.x;
                const dy = mouseY - lastMousePos.current.y;
                const canvasW = canvas.width;
                const canvasH = canvas.height;

                setResizeRect(prev => {
                    if (!prev) return null;
                    let { x, y, width, height } = prev;

                    const mode = dragMode.current;
                    if (mode === 'move') { x += dx; y += dy; }
                    else if (mode === 'tl') { x += dx; y += dy; width -= dx; height -= dy; }
                    else if (mode === 'tr') { y += dy; width += dx; height -= dy; }
                    else if (mode === 'bl') { x += dx; width -= dx; height += dy; }
                    else if (mode === 'br') { width += dx; height += dy; }
                    else if (mode === 't') { y += dy; height -= dy; }
                    else if (mode === 'b') { height += dy; }
                    else if (mode === 'l') { x += dx; width -= dx; }
                    else if (mode === 'r') { width += dx; }

                    const minSize = 20;
                    if (width < minSize) {
                        if (mode === 'tl' || mode === 'bl' || mode === 'l') x = prev.x + prev.width - minSize;
                        width = minSize;
                    }
                    if (height < minSize) {
                        if (mode === 'tl' || mode === 'tr' || mode === 't') y = prev.y + prev.height - minSize;
                        height = minSize;
                    }

                    x = Math.max(0, Math.min(x, canvasW - width));
                    y = Math.max(0, Math.min(y, canvasH - height));
                    width = Math.min(width, canvasW);
                    height = Math.min(height, canvasH);

                    return { x, y, width, height };
                });
            }
        }
        else if (isTransforming && !dragMode.current) {
            const handle = getTransformHandleAt(mouseX, mouseY);
            setActiveHandle(handle);
        }

        lastMousePos.current = { x: mouseX, y: mouseY };
        lastGlobalMousePos.current = { x: e.clientX, y: e.clientY };
    }, [isCropping, cropRect, isTransforming, getHandleAt, getTransformHandleAt, draw, zoom, image, imageTransform.scale, applyPanDelta, isResizingImage, resizeRect, getHandleForRect, clampCropRectToCanvas]);

    const handleCanvasMouseUp = useCallback(() => {
        const endedMode = dragMode.current;
        if (dragMode.current === 'paint') {
            const mCtx = maskCanvasRef.current?.getContext('2d');
            if (mCtx) mCtx.closePath();
        }
        if (endedMode && endedMode !== 'pan' && endedMode !== 'paint') {
            scheduleHistorySnapshot('Transform adjusted');
        }
        dragMode.current = null;
        setActiveHandle(null);
        setIsPanning(false);
        transformDragStartRef.current = null;
    }, [scheduleHistorySnapshot]);

    const updateFilter = (key: keyof FilterState, val: number) => {
        setFilters(prev => ({ ...prev, [key]: val }));
        scheduleHistorySnapshot(`Adjusted ${key}`);
    };

    const resetAll = () => {
        setFilters(DEFAULT_FILTERS);
        setRotation(0);
        setFlipH(false);
        setFlipV(false);
        setZoom(1);
        setPanOffset({ x: 0, y: 0 });
        setIsCropping(false);
        setCropRect(null);
        setIsResizingImage(false);
        setResizeRect(null);
        setIsTransforming(false);
        setImageTransform({ x: 0, y: 0, scale: 1 });
        setIsInpainting(false);
        clearMask();
        if (isGridMode) setGridItems({});
        if (!isGridMode && image) {
            resetHistoryWithSnapshot({
                imageSrc: image.src,
                filters: { ...DEFAULT_FILTERS },
                rotation: 0,
                flipH: false,
                flipV: false,
                imageTransform: { x: 0, y: 0, scale: 1 }
            });
        }
    };

    const rotate = (angle: number) => {
        setRotation(prev => (prev + angle) % 360);
        scheduleHistorySnapshot(`Rotated ${angle > 0 ? 'clockwise' : 'counterclockwise'}`);
    };
    const toggleFlip = (dir: 'h' | 'v') => {
        if (dir === 'h') setFlipH(!flipH);
        else setFlipV(!flipV);
        scheduleHistorySnapshot(dir === 'h' ? 'Flipped horizontal' : 'Flipped vertical');
    };

    const startCrop = (aspectRatio?: number) => {
        if (!canvasElRef.current) return;
        setIsCropping(true);
        setIsTransforming(false);
        setIsResizingImage(false);
        setResizeRect(null);
        setIsInpainting(false);
        const cw = canvasElRef.current.width;
        const ch = canvasElRef.current.height;
        let width = cw * 0.8;
        let height = ch * 0.8;
        if (aspectRatio) {
            if (cw / ch > aspectRatio) {
                height = ch * 0.8;
                width = height * aspectRatio;
            } else {
                width = cw * 0.8;
                height = width / aspectRatio;
            }
        }
        setCropRect({ x: (cw - width) / 2, y: (ch - height) / 2, width, height });
    };

    const setCropWidth = useCallback((w: number) => {
        if (!canvasElRef.current || !cropRect) return;
        const maxW = canvasElRef.current.width;
        const finalW = Math.max(20, Math.min(w, maxW));
        setCropRect(prev => prev ? clampCropRectToCanvas({ ...prev, width: finalW }, canvasElRef.current!.width, canvasElRef.current!.height) : null);
    }, [cropRect, clampCropRectToCanvas]);

    const setCropHeight = useCallback((h: number) => {
        if (!canvasElRef.current || !cropRect) return;
        const maxH = canvasElRef.current.height;
        const finalH = Math.max(20, Math.min(h, maxH));
        setCropRect(prev => prev ? clampCropRectToCanvas({ ...prev, height: finalH }, canvasElRef.current!.width, canvasElRef.current!.height) : null);
    }, [cropRect, clampCropRectToCanvas]);

    const applyCrop = async () => {
        if (!cropRect || !canvasElRef.current) return;
        const sourceCanvas = document.createElement('canvas');
        sourceCanvas.width = canvasElRef.current.width;
        sourceCanvas.height = canvasElRef.current.height;
        const sourceCtx = sourceCanvas.getContext('2d')!;
        drawBaseToContext(sourceCtx, sourceCanvas.width, sourceCanvas.height);
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = cropRect.width;
        tempCanvas.height = cropRect.height;
        const tempCtx = tempCanvas.getContext('2d');
        if (tempCtx) {
            tempCtx.drawImage(sourceCanvas, cropRect.x, cropRect.y, cropRect.width, cropRect.height, 0, 0, cropRect.width, cropRect.height);
            const nextSrc = tempCanvas.toDataURL();
            await loadImage(nextSrc, false, false);
            pushHistorySnapshot({
                imageSrc: nextSrc,
                filters: { ...DEFAULT_FILTERS },
                rotation: 0,
                flipH: false,
                flipV: false,
                imageTransform: { x: 0, y: 0, scale: 1 }
            }, 'Cropped image');
        }
        setIsCropping(false);
        setCropRect(null);
    };

    const cancelCrop = () => {
        setIsCropping(false);
        setCropRect(null);
    };

    useEffect(() => {
        const handleCropKeyDown = (e: KeyboardEvent) => {
            if (!isCropping) return;
            if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
            if (e.key === 'Enter') {
                e.preventDefault();
                applyCrop();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelCrop();
            }
        };
        window.addEventListener('keydown', handleCropKeyDown);
        return () => window.removeEventListener('keydown', handleCropKeyDown);
    }, [isCropping, applyCrop]);

    const startResize = () => {
        if (!canvasElRef.current) return;
        setIsResizingImage(true);
        setIsTransforming(false);
        setIsCropping(false);
        setCropRect(null);
        setIsInpainting(false);
        setResizeRect({
            x: 0,
            y: 0,
            width: canvasElRef.current.width,
            height: canvasElRef.current.height
        });
    };

    const setResizeWidth = useCallback((w: number) => {
        if (!resizeRect) return;
        const finalW = Math.max(20, Math.round(w));
        setResizeRect(prev => prev ? ({ ...prev, width: finalW }) : null);
    }, [resizeRect]);

    const setResizeHeight = useCallback((h: number) => {
        if (!resizeRect) return;
        const finalH = Math.max(20, Math.round(h));
        setResizeRect(prev => prev ? ({ ...prev, height: finalH }) : null);
    }, [resizeRect]);

    const applyResize = async () => {
        if (!resizeRect || !canvasElRef.current) return;
        const targetWidth = Math.max(20, Math.round(resizeRect.width));
        const targetHeight = Math.max(20, Math.round(resizeRect.height));

        const sourceCanvas = document.createElement('canvas');
        sourceCanvas.width = canvasElRef.current.width;
        sourceCanvas.height = canvasElRef.current.height;
        const sourceCtx = sourceCanvas.getContext('2d')!;
        drawBaseToContext(sourceCtx, sourceCanvas.width, sourceCanvas.height);

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = targetWidth;
        tempCanvas.height = targetHeight;
        const tempCtx = tempCanvas.getContext('2d');
        if (tempCtx) {
            tempCtx.imageSmoothingEnabled = true;
            tempCtx.imageSmoothingQuality = 'high';
            tempCtx.drawImage(sourceCanvas, 0, 0, sourceCanvas.width, sourceCanvas.height, 0, 0, targetWidth, targetHeight);
            const nextSrc = tempCanvas.toDataURL();
            await loadImage(nextSrc, false, false);
            pushHistorySnapshot({
                imageSrc: nextSrc,
                filters: { ...DEFAULT_FILTERS },
                rotation: 0,
                flipH: false,
                flipV: false,
                imageTransform: { x: 0, y: 0, scale: 1 }
            }, 'Resized image');
        }

        setIsResizingImage(false);
        setResizeRect(null);
        setActiveHandle(null);
    };

    const cancelResize = () => {
        setIsResizingImage(false);
        setResizeRect(null);
        setActiveHandle(null);
    };

    const getExportBlob = useCallback(async (): Promise<Blob | null> => {
        if (!canvasElRef.current) return null;

        const exportCanvas = document.createElement('canvas');
        const sourceCanvas = canvasElRef.current;
        exportCanvas.width = sourceCanvas.width;
        exportCanvas.height = sourceCanvas.height;
        const ctx = exportCanvas.getContext('2d');
        if (!ctx) return null;

        if (isGridMode) {
            const cellW = gridCellWidth;
            const cellH = gridCellHeight;
            const totalW = (cellW * gridCols) + (gridGutter * (gridCols - 1));
            const totalH = (cellH * gridRows) + (gridGutter * (gridRows - 1));
            exportCanvas.width = totalW;
            exportCanvas.height = totalH;

            ctx.clearRect(0, 0, exportCanvas.width, exportCanvas.height);
            ctx.fillStyle = '#050505';
            ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);

            for (let r = 0; r < gridRows; r++) {
                for (let c = 0; c < gridCols; c++) {
                    const idx = (r * gridCols) + c;
                    const item = gridItems[idx];
                    const x = c * (cellW + gridGutter);
                    const y = r * (cellH + gridGutter);
                    if (item) ctx.drawImage(item.img, x, y, cellW, cellH);
                    else {
                        ctx.fillStyle = '#0a0a0a';
                        ctx.fillRect(x, y, cellW, cellH);
                    }
                }
            }
        } else if (image) {
            drawBaseToContext(ctx, exportCanvas.width, exportCanvas.height);
        } else {
            return null;
        }

        return new Promise<Blob | null>((resolve) => {
            exportCanvas.toBlob((blob) => resolve(blob), 'image/png');
        });
    }, [isGridMode, image, drawBaseToContext, gridCols, gridRows, gridGutter, gridCellWidth, gridCellHeight, gridItems]);

    const startTransform = () => {
        setIsTransforming(true);
        setIsCropping(false);
        setCropRect(null);
        setIsResizingImage(false);
        setResizeRect(null);
        setIsInpainting(false);
    };

    const setTransformScale = (scale: number) => {
        setImageTransform(prev => ({ ...prev, scale: Math.max(0.1, Math.min(4, scale)) }));
        scheduleHistorySnapshot('Transform: scale');
    };

    const setTransformX = (x: number) => {
        setImageTransform(prev => ({ ...prev, x: Math.round(x) }));
        scheduleHistorySnapshot('Transform: move X');
    };

    const setTransformY = (y: number) => {
        setImageTransform(prev => ({ ...prev, y: Math.round(y) }));
        scheduleHistorySnapshot('Transform: move Y');
    };

    const resetTransform = () => {
        setImageTransform({ x: 0, y: 0, scale: 1 });
        scheduleHistorySnapshot('Reset transform');
    };

    const addGridItem = async (index: number, id: string, url: string) => {
        const img = await loadImage(url, true);
        setGridItems(prev => ({
            ...prev,
            [index]: { id, url, img }
        }));
    };

    const addGridItemsBatch = async (itemsToAdd: {id: string, url: string}[]) => {
        const nextGridItems = { ...gridItems };
        const maxSlots = gridCols * gridRows;
        let addedCount = 0;
        for (let i = 0; i < maxSlots && addedCount < itemsToAdd.length; i++) {
            if (!nextGridItems[i]) {
                const item = itemsToAdd[addedCount];
                const img = await loadImage(item.url, true);
                nextGridItems[i] = { id: item.id, url: item.url, img };
                addedCount++;
            }
        }
        setGridItems(nextGridItems);
    };

    const removeGridItem = (index: number) => {
        setGridItems(prev => {
            const next = { ...prev };
            delete next[index];
            return next;
        });
    };

    return {
        canvasElRef, image, loadImage, filters, updateFilter, resetAll, rotation, rotate, flipH, flipV, toggleFlip, zoom, setZoom, panOffset, setPanOffset, isPanning, isSpaceHeld, currentDimensions, isCropping, cropRect, isResizingImage, resizeRect, isTransforming, imageTransform, activeHandle, startCrop, setCropWidth, setCropHeight, applyCrop, cancelCrop, startResize, setResizeWidth, setResizeHeight, applyResize, cancelResize, startTransform, setTransformScale, setTransformX, setTransformY, resetTransform, canUndo, canRedo, undo, redo, snapshotHistory, restoreSnapshot, getExportBlob, isGridMode, setIsGridMode, gridCols, setGridCols, gridRows, setGridRows, gridGutter, setGridGutter, gridCellWidth, setGridCellWidth, gridCellHeight, setGridCellHeight, gridItems, hoveredSlot, setHoveredSlot, getSlotAt, addGridItem, addGridItemsBatch, removeGridItem, handleCanvasMouseDown, handleCanvasMouseMove, handleCanvasMouseUp,
        isInpainting, setIsInpainting, brushSize, setBrushSize, isEraser, setIsEraser, clearMask, maskCanvasRef
    };
};
