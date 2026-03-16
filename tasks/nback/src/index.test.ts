/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { __testing__, nbackAdapter } from './index';
import { createResponseSemantics, createVariableResolver } from '@experiments/core';

describe('NbackTaskAdapter', () => {
  it('exposes manifest and lifecycle hooks', () => {
    expect(nbackAdapter.manifest.taskId).toBe('nback');
    expect(typeof nbackAdapter.initialize).toBe('function');
    expect(typeof nbackAdapter.execute).toBe('function');
    expect(typeof nbackAdapter.terminate).toBe('function');
  });

  it('restores container presentation helper output correctly', async () => {
    const container = document.createElement('div');
    container.style.maxWidth = '640px';
    container.style.margin = '12px';
    container.style.fontFamily = 'serif';
    container.style.lineHeight = '1.8';

    const prior = __testing__.applyNbackRootPresentation(container);
    expect(container.classList.contains('exp-jspsych-canvas-centered')).toBe(true);
    __testing__.restoreNbackRootPresentation(container, prior);

    expect(container.style.maxWidth).toBe('640px');
    expect(container.style.margin).toBe('12px');
    expect(container.style.fontFamily).toBe('serif');
    expect(container.style.lineHeight).toBe('1.8');
    expect(container.classList.contains('exp-jspsych-canvas-centered')).toBe(false);
  });

  it('should capture the current trial response row directly from the response window', () => {
    const timeline: any[] = [];
    const capture = __testing__.appendJsPsychNbackTrial({
      timeline,
      parsed: {
        timing: {
          trialDurationMs: 1000,
          fixationDurationMs: 200,
          stimulusOnsetMs: 300,
          responseWindowStartMs: 300,
          responseWindowEndMs: 1000,
        },
        display: {
          aperturePx: 300,
          paddingYPx: 20,
          cueHeightPx: 0,
          cueMarginBottomPx: 0,
          frameBackground: '#fff',
          frameBorder: '1px solid #000',
          textColor: '#111',
          fixationFontSizePx: 24,
          fixationFontWeight: 500,
          stimulusFontSizePx: 40,
          stimulusScale: 1,
          imageWidthPx: null,
          imageHeightPx: null,
          imageUpscale: false,
        },
        responseSemantics: createResponseSemantics({ target: 'm', non_target: 'z' }),
      } as any,
      block: {
        label: 'Block 1',
        blockIndex: 0,
        blockType: 'practice',
        isPractice: true,
        nLevel: 2,
        stimulusVariant: null,
        trials: [],
        feedback: {
          enabled: false,
          durationMs: 0,
          messages: {
            correct: 'Correct',
            incorrect: 'Incorrect',
            timeout: 'Too slow',
            invalid: 'Invalid key',
            byResponseCategory: {},
          },
          style: {
            correctColor: '#22c55e',
            incorrectColor: '#ef4444',
            timeoutColor: '#f59e0b',
            invalidColor: '#f59e0b',
            byResponseCategoryColors: {},
            fontSizePx: 28,
            fontWeight: 700,
            canvasBackground: '#ffffff',
            canvasBorder: '2px solid #ddd',
          },
        },
        rtTask: { enabled: false, responseTerminatesTrial: false },
        beforeBlockScreens: [],
        afterBlockScreens: [],
        drt: { enabled: false },
        variables: {},
      } as any,
      trial: {
        trialIndex: 3,
        blockIndex: 0,
        trialType: 'target',
        item: 'A',
        sourceCategory: 'other',
        itemCategory: 'other',
        correctResponse: 'm',
      } as any,
      resolvedStimulus: 'A',
      runtime: {
        participantId: 'p1',
        variantId: 'v1',
        variableResolver: createVariableResolver({}),
      } as any,
      preloaded: { image: null },
      eventLogger: {
        emit: vi.fn(),
      } as any,
    });

    const responseWindow = timeline.find((entry) => entry.data?.phase?.startsWith('nback_response_window'));
    expect(responseWindow).toBeTruthy();

    responseWindow.on_finish({
      ...responseWindow.data,
      response: 'm',
      rt: 450,
    });

    expect(__testing__.readNbackTrialResponseRow(capture, 0, 3)).toEqual(
      expect.objectContaining({
        blockIndex: 0,
        trialIndex: 3,
        phase: 'nback_response_window_stimulus',
        responseKey: 'm',
        responseCorrect: 1,
      }),
    );
  });
});
