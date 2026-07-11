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
  const zPosRef = useRef(zPos);
  zPosRef.current = zPos;
  const requestIdRef = useRef(0);

  const upload = useCallback(
    async (file: File) => {
      if (lockedRef.current) return;
      const requestId = ++requestIdRef.current;

      try {
        const loaded = await load({ file, zPos: zPosRef.current });
        if ('ok' in loaded) {
          if (
            isCurrentOverlayRequest(
              requestId,
              requestIdRef.current,
              lockedRef.current,
            )
          ) {
            onStatus(invalidSizeStatus(loaded, t));
          }
          return;
        }
        if (
          !isCurrentOverlayRequest(
            requestId,
            requestIdRef.current,
            lockedRef.current,
          )
        ) {
          lifetimeRef.current!.discard(loaded);
          return;
        }
        setOverlay(lifetimeRef.current!.replace(loaded));
        onStatus({
          kind: 'info',
          text: t('advancedTools.loaded').replace('{name}', loaded.fileName),
        });
      } catch (error) {
        if (
          !isCurrentOverlayRequest(
            requestId,
            requestIdRef.current,
            lockedRef.current,
          )
        ) {
          return;
        }
        console.error('Custom overlay upload failed:', error);
        onStatus({ kind: 'error', text: t('download.failed') });
      }
    },
    [load, lockedRef, onStatus, t],
  );

  const changeZPos = useCallback(
    (raw: string) => {
      if (lockedRef.current) return;
      const nextZPos = parseCustomOverlayZPos(raw);
      zPosRef.current = nextZPos;
      setZPos(nextZPos);
      setOverlay(lifetimeRef.current!.updateZPos(nextZPos));
    },
    [lockedRef],
  );

  const clear = useCallback(() => {
    if (lockedRef.current) return;
    ++requestIdRef.current;
    setOverlay(lifetimeRef.current!.clear());
    zPosRef.current = 0;
    setZPos(0);
    onStatus({ kind: 'info', text: t('advancedTools.cleared') });
  }, [lockedRef, onStatus, t]);

  useEffect(() => {
    return () => {
      ++requestIdRef.current;
      lifetimeRef.current!.dispose();
    };
  }, []);

  return { overlay, zPos, upload, changeZPos, clear };
}
