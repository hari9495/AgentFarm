#!/bin/bash
# Direct xdotool script to fill the Employee Onboarding Form
# Uses window-search by title → no coordinate guessing needed

export DISPLAY=:1

# Launch the form
python3 /app/demo_form.py &
FORM_PID=$!
sleep 3

# Find and focus the window
WID=$(xdotool search --name "AgentFarm - Employee Onboarding Form" | head -1)
if [ -z "$WID" ]; then
  echo "ERROR: form window not found"
  exit 1
fi

echo "Window: $WID — focusing and filling form"
xdotool windowfocus --sync "$WID"
sleep 0.5

# Click the Full Name field (first widget after the title)
xdotool windowfocus "$WID"
# Tab to first entry field from window focus
xdotool key --window "$WID" Tab
sleep 0.3
xdotool key --clearmodifiers ctrl+a
xdotool type --clearmodifiers --delay 40 "Sarah Mitchell"

# Tab to Email Address
xdotool key Tab
sleep 0.3
xdotool key --clearmodifiers ctrl+a
xdotool type --clearmodifiers --delay 40 "sarah.mitchell@agentfarms.in"

# Tab to Job Title
xdotool key Tab
sleep 0.3
xdotool key --clearmodifiers ctrl+a
xdotool type --clearmodifiers --delay 40 "Senior Developer"

# Tab to Department (Combobox)
xdotool key Tab
sleep 0.3
xdotool key --clearmodifiers alt+Down
sleep 0.5
# alt+Down opens the combobox with Engineering (index 0) already highlighted
# pressing Return immediately selects it without any Down press needed
xdotool key Return

# Tab to Start Date
xdotool key Tab
sleep 0.3
xdotool key --clearmodifiers ctrl+a
xdotool type --clearmodifiers --delay 40 "2026-06-01"

# Tab to Submit button and press it
xdotool key Tab
sleep 0.3
xdotool key Return

echo "Form filled and submitted!"
sleep 5
wait $FORM_PID
