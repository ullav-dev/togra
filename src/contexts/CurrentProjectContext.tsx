"use client";

import { createContext, useContext, useState } from "react";

interface CurrentProject {
  id: string;
  name: string;
}

interface CurrentProjectState {
  project: CurrentProject | null;
  setCurrentProject: (p: CurrentProject | null) => void;
}

const CurrentProjectContext = createContext<CurrentProjectState>({
  project: null,
  setCurrentProject: () => {},
});

export function CurrentProjectProvider({ children }: { children: React.ReactNode }) {
  const [project, setCurrentProject] = useState<CurrentProject | null>(null);
  return (
    <CurrentProjectContext.Provider value={{ project, setCurrentProject }}>
      {children}
    </CurrentProjectContext.Provider>
  );
}

export function useCurrentProject() {
  return useContext(CurrentProjectContext);
}
