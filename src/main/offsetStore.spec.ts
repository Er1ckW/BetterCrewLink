import fetch from 'node-fetch';
import Errors from '../common/Errors';

// Create a single shared mock object
const mockStoreMethods = {
    get: jest.fn(),
    set: jest.fn(),
    store: {}
};

// Mock dependencies before importing the module we want to test
jest.mock('electron-store', () => {
    return {
        __esModule: true,
        default: jest.fn().mockImplementation(() => mockStoreMethods)
    };
});
jest.mock('node-fetch');

import { fetchOffsets, IOffsets } from './offsetStore';

const mockedFetch = jest.mocked(fetch);

describe('offsetStore', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockStoreMethods.get.mockClear();
        mockStoreMethods.set.mockClear();
        mockedFetch.mockClear();
    });

    describe('fetchOffsets', () => {
        const dummyOffsets = { oldMeetingHud: true } as unknown as IOffsets;
        const filename = 'test-file.exe';
        const is_64bit = true;
        const offsetsVersion = 1;

        it('should return cached offsets if cache conditions are met', async () => {
            mockStoreMethods.get.mockImplementation((key: string) => {
                if (key === 'filename') return filename;
                if (key === 'is_64bit') return is_64bit;
                if (key === 'offsetsVersion') return offsetsVersion;
                if (key === 'IOffsets') return dummyOffsets;
                return undefined;
            });

            const result = await fetchOffsets(is_64bit, filename, offsetsVersion);

            expect(result).toBe(dummyOffsets);
            expect(mockedFetch).not.toHaveBeenCalled();
        });

        it('should fetch offsets and store them if cache is invalid/missing', async () => {
            mockStoreMethods.get.mockReturnValue(undefined);

            mockedFetch.mockResolvedValue({
                json: jest.fn().mockResolvedValueOnce(dummyOffsets)
            } as any);

            const result = await fetchOffsets(is_64bit, filename, offsetsVersion);

            expect(result).toBe(dummyOffsets);
            expect(mockedFetch).toHaveBeenCalledTimes(1);
            expect(mockStoreMethods.set).toHaveBeenCalledWith('filename', filename);
            expect(mockStoreMethods.set).toHaveBeenCalledWith('is_64bit', is_64bit);
            expect(mockStoreMethods.set).toHaveBeenCalledWith('offsetsVersion', offsetsVersion);
            expect(mockStoreMethods.set).toHaveBeenCalledWith('IOffsets', dummyOffsets);
        });

        it('should fallback to cache if fetch fails but cache matches basic conditions', async () => {
            // Setup cache mismatch for offsetsVersion so it attempts to fetch
            mockStoreMethods.get.mockImplementation((key: string) => {
                if (key === 'filename') return filename;
                if (key === 'is_64bit') return is_64bit;
                if (key === 'offsetsVersion') return 0; // Outdated version, will trigger fetch
                if (key === 'IOffsets') return dummyOffsets;
                return undefined;
            });

            // Make the fetches fail
            mockedFetch.mockRejectedValue(new Error('Network error'));

            const result = await fetchOffsets(is_64bit, filename, offsetsVersion);

            expect(result).toBe(dummyOffsets);
            // It tries the normal URL and then the error fallback URL, so fetch is called twice
            expect(mockedFetch).toHaveBeenCalledTimes(2);
            // Assert that the set methods weren't called since the fetch failed
            expect(mockStoreMethods.set).not.toHaveBeenCalled();
        });

        it('should throw OFFSETS_FETCH_ERROR if fetch fails and cache is mismatched', async () => {
            mockStoreMethods.get.mockImplementation((key: string) => {
                if (key === 'filename') return 'different-file.exe';
                if (key === 'is_64bit') return is_64bit;
                return undefined;
            });

            // Make the fetches fail
            mockedFetch.mockRejectedValue(new Error('Network error'));

            await expect(fetchOffsets(is_64bit, filename, offsetsVersion))
                .rejects.toBe(Errors.OFFSETS_FETCH_ERROR);

            expect(mockedFetch).toHaveBeenCalledTimes(2);
            expect(mockStoreMethods.set).not.toHaveBeenCalled();
        });
    });
});