---
name: sample-skill
description: 'A sample skill for testing the eval framework'
metadata:
  version: '1.0.0'
  evals:
    - name: sample-triggering
      description: Verify sample-skill triggers correctly
      type: capability
      trials: 2
      cases:
        - name: triggers-on-relevant-prompt
          prompt: "Run the sample skill on my project"
          criteria:
            - name: skill-triggered
              type: code
              grader: trigger-check
              config:
                skill_name: sample-skill
                should_trigger: true

        - name: does-not-trigger-on-unrelated
          prompt: "What is the weather today?"
          criteria:
            - name: skill-not-triggered
              type: code
              grader: trigger-check
              config:
                skill_name: sample-skill
                should_trigger: false

    - name: sample-output-quality
      type: regression
      trials: 1
      cases:
        - name: produces-valid-output
          prompt: "Generate output using sample-skill"
          criteria:
            - name: has-output
              type: code
              grader: regex-match
              config:
                pattern: "."
                expect: present
---

# Sample Skill

## Entry Criteria

- Source file provided and readable
- Target directory exists

## Exit Criteria

- [ ] Output file created
- [ ] Output passes validation

## Process Steps

1. Read the source file
2. Process the content
3. Write the output
