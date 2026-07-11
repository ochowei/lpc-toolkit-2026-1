import { useCallback, useEffect, useRef, useState } from 'react';
import type { Translator } from '../i18n';
import {
  loadCustomOverlayImage,
  parseCustomOverlayZPos,
  type CustomOverlay,
  type InvalidCustomOverlayDimensions,
} from '../lib/custom-overlay';

type OverlayStatus = {
  readonly kind: 'info' | 'warn' | 'error';
  readonly text: string;
};

type LoadCustomOverlay = typeof loadCustomOverlayImage;

interface CustomOverlayControllerDependencies {
  readonly lockedRef: Readonly<{ current: boolean }>;
  readonly lifetime: CustomOverlayLifetime;
  readonly t: Translator;
  readonly onOverlay: (overlay: CustomOverlay | null) => void;
  readonly onZPos: (zPos: number) => void;
  readonly onStatus: (status: OverlayStatus) => void;
  readonly load: LoadCustomOverlay;
}

/** Owns object URLs created for custom overlays and revokes each at most once. */
export class CustomOverlayLifetime {
  private overlay: CustomOverlay | null = null;
  private readonly revoked = new Set<string>();

  constructor(private readonly revoke: (objectUrl: string) => void) {}

  replace(next: CustomOverlay): CustomOverlay {
    if (this.overlay?.objectUrl !== next.objectUrl) {
      this.revokeOnce(this.overlay);
    }
    this.overlay = next;
    return next;
  }

  updateZPos(zPos: number): CustomOverlay | null {
    if (!this.overlay) return null;
    this.overlay = { ...this.overlay, zPos };
    return this.overlay;
  }

  discard(overlay: CustomOverlay): void {
    if (this.overlay?.objectUrl === overlay.objectUrl) return;
    this.revokeOnce(overlay);
  }

  clear(): null {
    this.revokeOnce(this.overlay);
    this.overlay = null;
    return null;
  }

  dispose(): void {
    this.clear();
  }

  private revokeOnce(overlay: CustomOverlay | null): void {
    if (!overlay || this.revoked.has(overlay.objectUrl)) return;
    this.revoked.add(overlay.objectUrl);
    this.revoke(overlay.objectUrl);
  }
}

/** True only for the latest upload while composition actions are unlocked. */
export function isCurrentOverlayRequest(
  requestId: number,
  latestRequestId: number,
  locked: boolean,
): boolean {
  return requestId === latestRequestId && !locked;
}

/** Node-testable owner of custom-overlay actions and async request ordering. */
export class CustomOverlayController {
  private requestId = 0;
  private zPos = 0;

  constructor(private dependencies: CustomOverlayControllerDependencies) {}

  updateDependencies(
    dependencies: Omit<CustomOverlayControllerDependencies, 'lifetime'>,
  ): void {
    this.dependencies = {
      ...dependencies,
      lifetime: this.dependencies.lifetime,
    };
  }

  async upload(file: File): Promise<void> {
    if (this.dependencies.lockedRef.current) return;
    const requestId = ++this.requestId;

    try {
      const loaded = await this.dependencies.load({ file, zPos: this.zPos });
      if ('ok' in loaded) {
        if (this.isCurrent(requestId)) {
          this.dependencies.onStatus(
            invalidSizeStatus(loaded, this.dependencies.t),
          );
        }
        return;
      }
      if (!this.isCurrent(requestId)) {
        this.dependencies.lifetime.discard(loaded);
        return;
      }
      this.dependencies.onOverlay(
        this.dependencies.lifetime.replace(loaded),
      );
      this.dependencies.onStatus({
        kind: 'info',
        text: this.dependencies
          .t('advancedTools.loaded')
          .replace('{name}', loaded.fileName),
      });
    } catch (error) {
      if (!this.isCurrent(requestId)) return;
      console.error('Custom overlay upload failed:', error);
      this.dependencies.onStatus({
        kind: 'error',
        text: this.dependencies.t('download.failed'),
      });
    }
  }

  changeZPos(raw: string): void {
    if (this.dependencies.lockedRef.current) return;
    this.zPos = parseCustomOverlayZPos(raw);
    this.dependencies.onZPos(this.zPos);
    this.dependencies.onOverlay(
      this.dependencies.lifetime.updateZPos(this.zPos),
    );
  }

  clear(): void {
    if (this.dependencies.lockedRef.current) return;
    ++this.requestId;
    this.dependencies.onOverlay(this.dependencies.lifetime.clear());
    this.zPos = 0;
    this.dependencies.onZPos(this.zPos);
    this.dependencies.onStatus({
      kind: 'info',
      text: this.dependencies.t('advancedTools.cleared'),
    });
  }

  dispose(): void {
    ++this.requestId;
    this.dependencies.lifetime.dispose();
  }

  private isCurrent(requestId: number): boolean {
    return isCurrentOverlayRequest(
      requestId,
      this.requestId,
      this.dependencies.lockedRef.current,
    );
  }
}

function invalidSizeStatus(
  dimensions: InvalidCustomOverlayDimensions,
  t: Translator,
): OverlayStatus {
  return {
    kind: 'error',
    text: t('advancedTools.invalidSize')
      .replace('{width}', String(dimensions.width))
      .replace('{height}', String(dimensions.height)),
  };
}

/** Coordinates custom-overlay upload state, stale results, and object URL lifetime. */
export function useCustomOverlay(args: {
  readonly lockedRef: Readonly<{ current: boolean }>;
  readonly t: Translator;
  readonly onStatus: (status: OverlayStatus) => void;
  readonly load?: LoadCustomOverlay;
}) {
  const { lockedRef, t, onStatus, load = loadCustomOverlayImage } = args;
  const lifetimeRef = useRef<CustomOverlayLifetime>();
  if (!lifetimeRef.current) {
    lifetimeRef.current = new CustomOverlayLifetime((objectUrl) => {
      URL.revokeObjectURL(objectUrl);
    });
  }
  const [overlay, setOverlay] = useState<CustomOverlay | null>(null);
  const [zPos, setZPos] = useState(0);
  const controllerRef = useRef<CustomOverlayController>();
  if (!controllerRef.current) {
    controllerRef.current = new CustomOverlayController({
      lockedRef,
      lifetime: lifetimeRef.current,
      t,
      onOverlay: setOverlay,
      onZPos: setZPos,
      onStatus,
      load,
    });
  }
  controllerRef.current.updateDependencies({
    lockedRef,
    t,
    onOverlay: setOverlay,
    onZPos: setZPos,
    onStatus,
    load,
  });

  const upload = useCallback((file: File) => {
    return controllerRef.current!.upload(file);
  }, []);
  const changeZPos = useCallback((raw: string) => {
    controllerRef.current!.changeZPos(raw);
  }, []);
  const clear = useCallback(() => {
    controllerRef.current!.clear();
  }, []);

  useEffect(() => {
    return () => {
      controllerRef.current!.dispose();
    };
  }, []);

  return { overlay, zPos, upload, changeZPos, clear };
}
