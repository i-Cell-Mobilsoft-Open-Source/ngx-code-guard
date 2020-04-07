
export interface Schema {
    new: boolean;
    compilerFlags: string[];
    auditLevel: string;
    commitRule: {[prop: string]: any};
    packageMgr: string;
    linter: string;
    style: string;
    port: number;
    docTitle: string;
    docDir: string;
    docLocale: string;
    overwrite: boolean;
    ngProject: string;
    sonarURL: string;
    sonarProject: string;
    sonarExclusions: string;
    sonarId: string;
    useMd: boolean;
    useSnyk: boolean;
    cypressPort: number;
    a11y: string;
    customWebpack: string;
    headers: string[];
  }