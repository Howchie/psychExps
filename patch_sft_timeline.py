import re

file_path = "tasks/sft/src/index.ts"
with open(file_path, "r") as f:
    content = f.read()

# Add AudioService import
audio_import = 'import { AudioService } from "@experiments/core";\n'
content = audio_import + content

# Modify appendDotTrialTimeline arguments
append_args = """function appendDotTrialTimeline(args: {
  timeline: any[];
  config: SftParsedConfig;
  audioService?: AudioService;
"""
content = re.sub(r'function appendDotTrialTimeline\(args: \{\n  timeline: any\[\];\n  config: SftParsedConfig;', append_args, content)

# Destructure audioService
destructure_args = """  const { timeline, config, audioService, trialProvider, allowedKeys, rng, phasePrefix, onResponse, dataContext, feedback } = args;"""
content = re.sub(r'  const \{ timeline, config, trialProvider, allowedKeys, rng, phasePrefix, onResponse, dataContext, feedback \} = args;', destructure_args, content)


# Add onStimulusPhaseStart to buildJsPsychRtTimelineNodes
on_stim_start = """    onStimulusPhaseStart: () => {
      const trial = trialProvider();
      if (!trial || !audioService) return;
      if (trial.stimCategory === "AB" || trial.stimCategory === "AN" || trial.stimCategory === "NB" || trial.stimCategory === "NN" || trial.stimCode) {
         if (trial.showRuleCue === false && trial.stimCode.includes("x")) {
             // In SFT visual/audio might be combined. For pure visual it's fine. For pure audio we might need a flag.
             // We'll play audio for any auditory components if available, or base it on salience.
             // "salience" determines volume.
         }
      }
      // If we have an audio setting and salience for auditory > 0, we can play it.
      // SFT has high/low salience. For audio, high salience could mean full volume, low means reduced.
      // E.g., if dot salience works for vision, we can use it to scale audio volume.
      // Actually, we'll play the tone if the trial implies an auditory stimulus.
      // If SFT becomes redundant target (audio + visual), we might need to know if the trial includes audio.
      // For now, if audioService is provided and salience > 0, we play. We use trial.salience.high / low.

      let targetSalience = 0;
      // If the stimCode indicates high/low salience for the target, use it.
      // We can assume standard SFT codes like 'HH', 'Hx', 'xH' etc.
      // Usually channel 1 is visual, channel 2 could be auditory?
      // For a redundant target task, "Hx" means High visual, no audio. "xH" means no visual, High audio. "HH" means High visual, High audio.
      const code = trial.stimCode;
      if (code.length === 2) {
          const audioChar = code[1]; // Assume channel 2 is audio
          if (audioChar === 'H') targetSalience = trial.salience.high;
          else if (audioChar === 'L') targetSalience = trial.salience.low;
          else if (audioChar === 'x') targetSalience = 0;
          else targetSalience = trial.salience.high; // fallback
      } else {
         targetSalience = trial.salience.high;
      }

      if (targetSalience > 0) {
         const baseVol = config.audio.volume;
         // Scale volume by salience. Salience is between 0 and 1.
         const vol = baseVol * targetSalience;
         audioService.playTone(config.audio.frequencyHz, config.audio.durationMs, {
             waveform: config.audio.waveform,
             volume: vol
         });
      }
    },
    onResponse: """
content = re.sub(r'    onResponse: ', on_stim_start, content)

with open(file_path, "w") as f:
    f.write(content)

print("Patched SFT Timeline")
