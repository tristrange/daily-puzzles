import { describe, expect, it } from 'vitest';
import cases from '../../../conformance/enclosure-cases/cases.json';
import { EnclosureGrid, createEnclosureGame, enclosureFingerprint, evaluate, resetEnclosure, toggleWall } from './enclosure';

describe('enclosure', () => {
  it.each(cases)('$name', ({ size, water, horse, wallBudget, walls, escaped, reachable, score }) => {
    expect(evaluate(new EnclosureGrid(size, water, horse, wallBudget), walls)).toEqual({ escaped, reachable, score });
  });
  it('toggles legal walls and preserves no-op identity', () => {
    const grid = new EnclosureGrid(3, [], 4, 1);
    const empty = createEnclosureGame(grid);
    expect(toggleWall(empty, 4)).toBe(empty);
    const one = toggleWall(empty, 1);
    expect(toggleWall(one, 3)).toBe(one);
    expect(toggleWall(one, 1).walls).toEqual([]);
    expect(resetEnclosure(empty)).toBe(empty);
    expect(resetEnclosure(one).walls).toEqual([]);
    expect(enclosureFingerprint(grid)).toBe('[3,[],4,1,null]');
  });
  it('copies water and leaves existing game state untouched', () => {
    const water = [0]
    const grid = new EnclosureGrid(3, water, 4, 2)
    water.push(1)
    expect(grid.water).toEqual([0])
    expect(Object.isFrozen(grid)).toBe(true)
    expect(Object.isFrozen(grid.water)).toBe(true)
    const game = createEnclosureGame(grid)
    expect(toggleWall(game, 0)).toBe(game)
    expect(toggleWall(game, 4)).toBe(game)
    const updated = toggleWall(game, 1)
    expect(game.walls).toEqual([])
    expect(updated.walls).toEqual([1])
  })
  it('rejects malformed grids and walls', () => {
    for (const args of [[true, [], 0, 0], [3, [1, 1], 4, 0], [3, [4], 4, 0], [3, [], 4, 9], [3, [], 4, 0, 0]]) {
      expect(() => new EnclosureGrid(args[0], args[1], args[2], args[3], args[4])).toThrow();
    }
    const grid = new EnclosureGrid(3, [], 4, 4);
    for (const walls of [[1, 1], [3, 1], [4], [9], [1, 3, 5, 7, 8], Array(1)]) expect(() => evaluate(grid, walls)).toThrow();
    expect(() => resetEnclosure({ grid, walls: [1, 1] })).toThrow()
    expect(() => resetEnclosure({ grid, walls: Array(1) })).toThrow()
  });
});
