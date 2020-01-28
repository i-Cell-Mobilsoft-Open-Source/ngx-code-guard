
export interface Schema {
    new: boolean;
    commitRule: string;
    packageMgr: string;
    linter: string;
    style: string;
    port: number;
    docTitle: string;
    docDir: string;
    overwrite: boolean;
    ngProject: string;
    sonarProject: string;
    sonarExclusions: string;
    sonarId: string;
    useMd: boolean;
    cypressPort: number;
    a11y: string;
    statsFile: string;
    headers: string[];
  }