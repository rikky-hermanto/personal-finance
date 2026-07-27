#!/usr/bin/env python3
"""
PostToolUse hook (matcher: Skill): after any Skill invocation completes,
nudges Claude to reflect on whether the skill just used deserves an update.

Does not decide anything itself - just injects a reminder into context.
Claude (via skill-creator) makes the actual necessity call.
"""

import sys
import json


def main() -> None:
    try:
        data = json.loads(sys.stdin.read() or '{}')
    except json.JSONDecodeError:
        data = {}

    tool_input = data.get('tool_input') or {}
    skill = tool_input.get('skill') or 'the skill you just used'

    context = (
        f'You just finished using the "{skill}" skill. Briefly reflect on this usage: '
        'was anything surprising, incomplete, or did you have to work around a gap or '
        'wrong assumption in its instructions? If there is a concrete, real learning worth '
        f'capturing, invoke the skill-creator skill to evaluate whether "{skill}"\'s SKILL.md '
        'should be updated, and only apply an update if skill-creator determines it is actually '
        'necessary. If the skill worked exactly as expected with nothing notable to report, '
        'skip this entirely - do not edit the skill just because it was used.'
    )

    output = {
        'hookSpecificOutput': {
            'hookEventName': 'PostToolUse',
            'additionalContext': context,
        }
    }
    print(json.dumps(output))


if __name__ == '__main__':
    main()
