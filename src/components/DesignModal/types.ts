import type { Preferences } from '../../types';

export type TabSection = 'document' | 'typography' | 'spacing' | 'structure' | 'images' | 'presets' | 'advanced';

export interface TabProps {
  local: Preferences;
  mutate: (patch: Partial<Preferences>) => void;
}
