import re

file_path = "tasks/sft/src/index.ts"
with open(file_path, "r") as f:
    content = f.read()

# Since `stimCode` is already in PlannedTrial and TrialRecord, and it natively encodes channels (e.g. "HH", "Hx"),
# we just need to make sure the logging logs audio correctly if we want.
# Actually, the `channel1` and `channel2` already extract this in the CSV logger or data pipeline?
# Let's check how channel1 and channel2 are generated.
