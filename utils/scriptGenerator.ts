
import { Storyboard } from '../types';

export const generatePythonSynthesisScript = (storyboard: Storyboard): string => {
  const storyboardJson = JSON.stringify(storyboard, null, 2);

  return `
"""
Historian AI: Production Metadata Export
Note: Synthesis is now handled directly in-browser. 
This file contains the raw storyboard data for professional post-production.
"""

STORYBOARD_DATA = ${storyboardJson}

def main():
    print(f"Project: {STORYBOARD_DATA['title']}")
    print(f"Subject: {STORYBOARD_DATA['subject']}")
    print(f"Scenes Count: {len(STORYBOARD_DATA['scenes'])}")
    print("---")
    for i, scene in enumerate(STORYBOARD_DATA['scenes']):
        print(f"Scene {i+1}: {scene['narration'][:50]}...")

if __name__ == "__main__":
    main()
`;
};
