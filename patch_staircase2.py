import re

file_path = "tasks/sft/src/index.ts"
with open(file_path, "r") as f:
    content = f.read()

# Add `stimCode` to StaircaseSpec
staircase_spec_re = r'interface StaircaseSpec \{\n  enabled: boolean;\n  nTrials: number;'
staircase_spec_addition = """interface StaircaseSpec {
  enabled: boolean;
  stimCode: string;
  nTrials: number;"""
content = re.sub(staircase_spec_re, staircase_spec_addition, content)

# Update parseStaircase
parse_staircase_re = r'    enabled,\n    nTrials: toPositiveNumber\(raw\.n_trials \?\? raw\.nTrials, 20\),'
parse_staircase_addition = """    enabled,
    stimCode: asString(raw.stim_code ?? raw.stimCode) || "Hx",
    nTrials: toPositiveNumber(raw.n_trials ?? raw.nTrials, 20),"""
content = re.sub(parse_staircase_re, parse_staircase_addition, content)


# Update appendStaircaseTimeline to use config.staircase.stimCode instead of hardcoded "Hx"
append_staircase_re = r'stimCode: "Hx",'
append_staircase_addition = """stimCode: staircase.stimCode,"""
content = re.sub(append_staircase_re, append_staircase_addition, content)


with open(file_path, "w") as f:
    f.write(content)

print("Patched Staircase")
