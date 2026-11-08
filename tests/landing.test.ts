import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { knockyDots, VIEWBOX } from '@/components/landing/halftone';

describe('landing hero halftone (Knocky)', () => {
  it('is deterministic, so server and browsers draw the same mascot', () => {
    const a = knockyDots();
    assert.ok(a.length > 5000, `expected thousands of dots, got ${a.length}`);
    assert.equal(a, knockyDots());
  });
  it('keeps every dot inside the hero viewBox with a valid print order', () => {
    for (const d of knockyDots()) {
      assert.ok(d.x >= VIEWBOX.x && d.x <= VIEWBOX.x + VIEWBOX.w, `x ${d.x}`);
      assert.ok(d.y >= VIEWBOX.y && d.y <= VIEWBOX.y + VIEWBOX.h, `y ${d.y}`);
      assert.ok(d.r > 0 && d.r < 4, `r ${d.r}`);
      assert.ok(d.order >= -0.1 && d.order <= 1.1, `order ${d.order}`);
    }
  });
});
