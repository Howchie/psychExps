import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getJatosApi,
  isJatosAvailable,
  readJatosSelectionInput,
  readJatosUrlQueryParameters,
  submitToJatos,
  appendToJatos,
  endJatosStudy,
} from './jatos';

describe('jatos infrastructure', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Reset global window and jatos mocks
    vi.stubGlobal('window', {});
    vi.stubGlobal('jatos', undefined);

    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('getJatosApi', () => {
    it('returns undefined if window is undefined', () => {
      // simulate no window by temporarily deleting the stubbed window
      vi.stubGlobal('window', undefined);
      expect(getJatosApi()).toBeUndefined();
    });

    it('returns window.jatos if available', () => {
      const mockApi = { endStudy: vi.fn() };
      vi.stubGlobal('window', { jatos: mockApi });
      expect(getJatosApi()).toBe(mockApi);
    });

    it('returns global jatos if window.jatos is not available', () => {
      const mockApi = { endStudy: vi.fn() };
      vi.stubGlobal('jatos', mockApi);
      expect(getJatosApi()).toBe(mockApi);
    });

    it('returns undefined if neither are available', () => {
      expect(getJatosApi()).toBeUndefined();
    });
  });

  describe('isJatosAvailable', () => {
    it('returns true if JATOS API is available', () => {
      vi.stubGlobal('window', { jatos: { endStudy: vi.fn() } });
      expect(isJatosAvailable()).toBe(true);
    });

    it('returns false if JATOS API is not available', () => {
      expect(isJatosAvailable()).toBe(false);
    });
  });

  describe('readJatosSelectionInput', () => {
    it('returns null if API is not available', () => {
      expect(readJatosSelectionInput()).toBeNull();
    });

    it('returns object from componentJsonInput if it is a valid object', () => {
      const data = { foo: 'bar' };
      vi.stubGlobal('window', { jatos: { componentJsonInput: data } });
      expect(readJatosSelectionInput()).toEqual(data);
    });

    it('parses valid JSON string from componentJsonInput', () => {
      const data = { foo: 'bar' };
      vi.stubGlobal('window', { jatos: { componentJsonInput: JSON.stringify(data) } });
      expect(readJatosSelectionInput()).toEqual(data);
    });

    it('returns object from studySessionData if componentJsonInput is missing/invalid', () => {
      const data = { foo: 'bar' };
      vi.stubGlobal('window', { jatos: { componentJsonInput: 'invalid json', studySessionData: data } });
      expect(readJatosSelectionInput()).toEqual(data);
    });

    it('parses valid JSON string from studySessionData', () => {
      const data = { foo: 'bar' };
      vi.stubGlobal('window', { jatos: { studySessionData: JSON.stringify(data) } });
      expect(readJatosSelectionInput()).toEqual(data);
    });

    it('returns null if both are missing or invalid', () => {
      vi.stubGlobal('window', { jatos: { componentJsonInput: 'invalid', studySessionData: '[]' } });
      expect(readJatosSelectionInput()).toBeNull();
    });

    it('returns null if parsed data is an array (not an object)', () => {
      vi.stubGlobal('window', { jatos: { componentJsonInput: [1, 2] } });
      expect(readJatosSelectionInput()).toBeNull();
    });

    it('returns null for empty strings', () => {
      vi.stubGlobal('window', { jatos: { componentJsonInput: '   ' } });
      expect(readJatosSelectionInput()).toBeNull();
    });
  });

  describe('readJatosUrlQueryParameters', () => {
    it('returns empty URLSearchParams if API is missing', () => {
      const params = readJatosUrlQueryParameters();
      expect(params).toBeInstanceOf(URLSearchParams);
      expect([...params.entries()]).toHaveLength(0);
    });

    it('returns empty URLSearchParams if urlQueryParameters is missing/invalid', () => {
      vi.stubGlobal('window', { jatos: { urlQueryParameters: 'invalid' } });
      const params = readJatosUrlQueryParameters();
      expect([...params.entries()]).toHaveLength(0);
    });

    it('converts urlQueryParameters object entries to URLSearchParams', () => {
      vi.stubGlobal('window', {
        jatos: {
          urlQueryParameters: {
            a: '1',
            b: 2,
            c: [3, 4],
            d: null,
            e: undefined,
          },
        },
      });
      const params = readJatosUrlQueryParameters();
      expect(params.get('a')).toBe('1');
      expect(params.get('b')).toBe('2');
      expect(params.getAll('c')).toEqual(['3', '4']);
      expect(params.has('d')).toBe(false);
      expect(params.has('e')).toBe(false);
    });
  });

  describe('submitToJatos', () => {
    it('returns false if API is missing', async () => {
      expect(await submitToJatos({})).toBe(false);
    });

    it('calls submitResultData and returns true on success', async () => {
      const submitMock = vi.fn().mockResolvedValue(undefined);
      vi.stubGlobal('window', { jatos: { submitResultData: submitMock } });

      const payload = { test: 123 };
      expect(await submitToJatos(payload)).toBe(true);
      expect(submitMock).toHaveBeenCalledWith(payload);
    });

    it('catches errors, logs them, and returns false', async () => {
      const error = new Error('Network error');
      const submitMock = vi.fn().mockRejectedValue(error);
      vi.stubGlobal('window', { jatos: { submitResultData: submitMock } });

      expect(await submitToJatos({})).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalledWith('JATOS submit failed', error);
    });
  });

  describe('appendToJatos', () => {
    it('returns false if API is missing', async () => {
      expect(await appendToJatos({})).toBe(false);
    });

    it('returns false if appendResultData is not a function', async () => {
      vi.stubGlobal('window', { jatos: { appendResultData: 'not a function' } });
      expect(await appendToJatos({})).toBe(false);
    });

    it('calls appendResultData and returns true on success', async () => {
      const appendMock = vi.fn().mockResolvedValue(undefined);
      vi.stubGlobal('window', { jatos: { appendResultData: appendMock } });

      const payload = { test: 123 };
      expect(await appendToJatos(payload)).toBe(true);
      expect(appendMock).toHaveBeenCalledWith(payload);
    });

    it('catches errors, logs them, and returns false', async () => {
      const error = new Error('Network error');
      const appendMock = vi.fn().mockRejectedValue(error);
      vi.stubGlobal('window', { jatos: { appendResultData: appendMock } });

      expect(await appendToJatos({})).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalledWith('JATOS append failed', error);
    });
  });

  describe('endJatosStudy', () => {
    it('does nothing if API is missing', async () => {
      await endJatosStudy();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('calls endStudy on the API', async () => {
      const endMock = vi.fn().mockResolvedValue(undefined);
      vi.stubGlobal('window', { jatos: { endStudy: endMock } });

      await endJatosStudy();
      expect(endMock).toHaveBeenCalled();
    });

    it('catches errors and logs them', async () => {
      const error = new Error('Study error');
      const endMock = vi.fn().mockRejectedValue(error);
      vi.stubGlobal('window', { jatos: { endStudy: endMock } });

      await endJatosStudy();
      expect(consoleErrorSpy).toHaveBeenCalledWith('JATOS endStudy failed', error);
    });
  });
});
