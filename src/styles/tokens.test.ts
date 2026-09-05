import { describe, it, expect } from 'vitest';

// We dynamically read files using node builtins at runtime in tests
// without importing them at top-level to stay compatible with tsconfig.app.json (lib: DOM, no @types/node).
// Vitest runs in Node.js environment.
function readProjectFile(relativePath: string): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const req = (globalThis as unknown as { process: { cwd: () => string } });
  const cwd = req.process.cwd();
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const nodeFs = (globalThis as any).process ? eval("require('fs')") : null;
  const nodePath = (globalThis as any).process ? eval("require('path')") : null;
  const fullPath = nodePath.resolve(cwd, relativePath);
  return nodeFs.readFileSync(fullPath, 'utf8');
}

/** Calculate relative luminance according to WCAG 2.1 specs */
function getRelativeLuminance(hex: string): number {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16) / 255;
  const g = parseInt(cleanHex.substring(2, 4), 16) / 255;
  const b = parseInt(cleanHex.substring(4, 6), 16) / 255;

  const toLinear = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/** WCAG contrast ratio between two hex colors */
function getContrastRatio(hex1: string, hex2: string): number {
  const lum1 = getRelativeLuminance(hex1);
  const lum2 = getRelativeLuminance(hex2);
  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);
  return (brightest + 0.05) / (darkest + 0.05);
}

describe('Design tokens in tokens.css', () => {
  const css = readProjectFile('src/styles/tokens.css');
  const remarkCss = readProjectFile('src/components/RemarkRow.module.css');
  const trainingsCss = readProjectFile('src/screens/TrainingsScreen.module.css');

  // Parse root and dark theme blocks
  const rootMatch = css.match(/:root\s*\{([^}]+)\}/);
  const darkMatch = css.match(/\[data-theme=['"]dark['"]\]\s*\{([^}]+)\}/);

  it('contains root and dark theme definitions', () => {
    expect(rootMatch).not.toBeNull();
    expect(darkMatch).not.toBeNull();
  });

  const extractToken = (block: string, token: string): string | null => {
    const regex = new RegExp(`${token}:\\s*([^;]+);`);
    const match = block.match(regex);
    return match ? match[1].trim() : null;
  };

  describe('--color-success-solid contrast with white text (#ffffff)', () => {
    it('light theme --color-success-solid has contrast >= 4.5:1 with white text', () => {
      const rootBlock = rootMatch![1];
      const successSolid = extractToken(rootBlock, '--color-success-solid');
      expect(successSolid).toBeTruthy();

      // Either resolves directly or via var(--color-success)
      let hex = successSolid!;
      if (hex.startsWith('var(--color-success)')) {
        hex = extractToken(rootBlock, '--color-success')!;
      }
      expect(hex).toMatch(/^#[0-9a-fA-F]{6}$/);

      const ratio = getContrastRatio('#ffffff', hex);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it('dark theme --color-success-solid has contrast >= 4.5:1 with white text', () => {
      const darkBlock = darkMatch![1];
      const successSolid = extractToken(darkBlock, '--color-success-solid');
      expect(successSolid).toBeTruthy();
      expect(successSolid).toMatch(/^#[0-9a-fA-F]{6}$/);

      const ratio = getContrastRatio('#ffffff', successSolid!);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });
  });

  describe('--target-crosshair token', () => {
    it('is defined in light theme (:root) and dark theme', () => {
      const rootBlock = rootMatch![1];
      const darkBlock = darkMatch![1];

      const lightCrosshair = extractToken(rootBlock, '--target-crosshair');
      const darkCrosshair = extractToken(darkBlock, '--target-crosshair');

      expect(lightCrosshair).toBeTruthy();
      expect(darkCrosshair).toBeTruthy();
      expect(lightCrosshair).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(darkCrosshair).toMatch(/^#[0-9a-fA-F]{6}$/);
    });
  });

  describe('no outdated fallbacks or hardcoded crosshairs', () => {
    it('does not define obsolete #c0392b in tokens or remark row styles', () => {
      expect(css).not.toContain('#c0392b');
      expect(remarkCss).not.toContain('#c0392b');
    });

    it('badge in TrainingsScreen.module.css uses --color-success-solid', () => {
      expect(trainingsCss).toContain('var(--color-success-solid)');
    });
  });
});
