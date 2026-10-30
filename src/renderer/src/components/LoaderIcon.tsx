import forgeIcon from '../assets/loaders/forge.png';
import neoforgeIcon from '../assets/loaders/neoforge.png';
import fabricIcon from '../assets/loaders/fabric.png';
import quiltIcon from '../assets/loaders/quilt.png';
import type { LoaderKind } from '../../../shared/types';

const images: Partial<Record<LoaderKind, { src: string; pixelated: boolean }>> = {
  forge: { src: forgeIcon, pixelated: false },
  quilt: { src: quiltIcon, pixelated: false },
  neoforge: { src: neoforgeIcon, pixelated: true },
  fabric: { src: fabricIcon, pixelated: true }
};

export function LoaderIcon({ loader, size = 32 }: { loader: LoaderKind; size?: number }) {
  const img = images[loader];
  if (img) {
    return (
      <img
        src={img.src}
        alt={loader}
        width={size}
        height={size}
        draggable={false}
        style={{ objectFit: 'contain', imageRendering: img.pixelated ? 'pixelated' : 'auto' }}
      />
    );
  }
  // vanilla: isometric grass block
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <polygon points="12,1.5 22.5,6.75 12,12 1.5,6.75" fill="#7cb342" />
      <polygon points="1.5,6.75 12,12 12,22.5 1.5,17.25" fill="#8d6e63" />
      <polygon points="22.5,6.75 12,12 12,22.5 22.5,17.25" fill="#6d4c41" />
      <polygon points="1.5,6.75 12,12 12,14.4 1.5,9.15" fill="#689f38" />
      <polygon points="22.5,6.75 12,12 12,14.4 22.5,9.15" fill="#558b2f" />
    </svg>
  );
}
