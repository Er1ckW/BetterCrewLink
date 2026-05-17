import { poseCollide } from '../src/common/ColliderMap';
import { MapType } from '../src/common/AmongusMap';

jest.mock('path-intersection', () => {
	return jest.fn((path1, path2) => {
		// We will mock path-intersection behavior for testing logic
		// This avoids issues with import/export defaults and isolates our tests

		// Mock specific intersections for tests
		// For general "no intersection" tests
		if (path1.includes('THE_SKELD') || path1 === 'no-intersect' || path2.includes('-2 -2')) {
			return [];
		}

		// Return a fake intersection for specific paths
		// 'M 33.65 35.32' logic check
		if (path2.includes('M 33 36') || path2.includes('L 35 36')) {
			return [{ x: 33.65, y: 36 }];
		}

		// Doors mock
		if (path1 === 'M 45.059 37.568 V 39.744 ' || path1 === 'M 45.059 37.568 V 39.744') {
			if (path2.includes('44 38') && path2.includes('46 38')) {
				return [{ x: 45.059, y: 38 }];
			}
		}
		return [];
	});
});

// We want to test path-intersection using mocked/verified values,
// since the method relies heavily on intersections.
// We also want to verify MapType.THE_SKELD_APRIL handling, UNKNOWN, doors and basic paths.

describe('poseCollide', () => {
	it('should return false for MapType.UNKNOWN', () => {
		const result = poseCollide({ x: 0, y: 0 }, { x: 10, y: 10 }, MapType.UNKNOWN, []);
		expect(result).toBe(false);
	});

	it('should return false if there are no intersections on the skeld map without doors', () => {
		// Just a general sanity check on coordinates where we know there's no collision
		const result = poseCollide({ x: 1, y: 1 }, { x: 2, y: 2 }, MapType.THE_SKELD, []);
		expect(result).toBe(false);
	});

	it('should correctly handle MapType.THE_SKELD_APRIL', () => {
		// THE_SKELD_APRIL flips the x coordinates and acts as THE_SKELD.
		// We can test this by checking that if we pass coordinates, they are multiplied by -1.
		const p1 = { x: -1, y: 1 };
		const p2 = { x: -2, y: 2 };

		poseCollide(p1, p2, MapType.THE_SKELD_APRIL, []);

		// The original coordinates are modified in-place
		expect(p1.x).toBe(1);
		expect(p2.x).toBe(2);
	});

	it('should return true if intersecting a path', () => {
		// Based on the Skeld collider: 'M 33.65 35.32 V 37.57...'
		// If we intersect it, path-intersection will return an array with items.
		// We'll mock the `path-intersection` since it's an external library
		// or pass coords that are known to intersect it based on logic.
		// For coordinate conversion: intersect uses M {x+40} {40-y}.
		// If we want {x+40}=33.65 => x = -6.35
		// If we want {40-y}=36 => y = 4
		const p1 = { x: -7, y: 4 };
		const p2 = { x: -5, y: 4 };

		// This horizontal line should cross the vertical line 'V 37.57' around x = 33.65 (which is -6.35)
		const result = poseCollide(p1, p2, MapType.THE_SKELD, []);
		expect(result).toBe(true);
	});

	it('should return false if doors are open (not provided in closedDoors)', () => {
		// Test cafetaria -> weapons door: 'M 45.059 37.568 V 39.744'
		// x = 5.059, y = 40 - 38 = 2
		const p1 = { x: 4, y: 2 };
		const p2 = { x: 6, y: 2 };

		const result = poseCollide(p1, p2, MapType.THE_SKELD, []);
		expect(result).toBe(false);
	});

	it('should return true if doors are closed and intersected', () => {
		// Test cafetaria -> weapons door: doorId = 0
		// 'M 45.059 37.568 V 39.744 '
		const p1 = { x: 4, y: 2 }; // {x:44, y:38}
		const p2 = { x: 6, y: 2 }; // {x:46, y:38}

		const result = poseCollide(p1, p2, MapType.THE_SKELD, [0]);
		expect(result).toBe(true);
	});

	it('should gracefully return false if map does not exist in doorMaps or colliderMaps', () => {
		// If a map like MapType.SUBMERGED is currently undefined in colliderMaps, we can test it
		const result = poseCollide({ x: 0, y: 0 }, { x: 10, y: 10 }, MapType.SUBMERGED, []);
		expect(result).toBe(false);
	});
});
