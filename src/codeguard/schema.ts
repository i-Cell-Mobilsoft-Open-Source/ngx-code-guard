
export interface Schema {
    new: boolean;
    compilerFlags: string[];
    auditLevel: string;
    commitRule: string;
    packageMgr: string;
    linter: string;
    style: string;
    port: number;
    docTitle: string;
    docDir: string;
    overwrite: boolean;
    ngProject: string;
    sonarURL: string;
    sonarProject: string;
    sonarExclusions: string;
    sonarId: string;
    useMd: boolean;
    cypressPort: number;
    a11y: string;
    statsFile: string;
    customWebpack: string;
    headers: string[];
  }