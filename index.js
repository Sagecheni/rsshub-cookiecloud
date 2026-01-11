import { pathToFileURL } from 'node:url';

import { CookieCloudConfig } from "./libs/config.js";
import { createCookieCloudSyncJob } from "./libs/cookie-cloud.js";
import { CookieCloudDir } from "./libs/dir.js";
import { distJsRegExp, findJs, readJs } from "./libs/import-js.js";
import { route } from "./libs/route.js";
import { findSetConfigFunc } from "./libs/set-config.js";

async function setupCookieCloud() {
    try {
        console.log("[CookieCloud] trying hacking RSSHub...");

        if (CookieCloudConfig === undefined) {
            console.log('[CookieCloud] config not valid, CookieCloud not load.');
            return;
        }

        const appBootstrapJsContent = await readJs("app-bootstrap");
        const routerFileRegex = distJsRegExp('routes', '', '');
        let routerImportPath;
        let routerFile;

        if (appBootstrapJsContent) {
            const productionRouterBlock = appBootstrapJsContent.match(
                new RegExp('case`production`:[\\s\\S]*?' + routerFileRegex.source)
            );
            routerFile = productionRouterBlock?.[0]?.match(routerFileRegex)?.[0]
                ?? appBootstrapJsContent.match(routerFileRegex)?.[0];
            if (routerFile) {
                routerImportPath = `${CookieCloudDir}/../dist/${routerFile}`;
            }
        } else {
            console.log('[CookieCloud] cannot find app-bootstrap-xxx.mjs, trying fallback.');
        }

        if (!routerImportPath) {
            const fallbackPath = await findJs('routes');
            if (fallbackPath) {
                routerImportPath = fallbackPath;
                routerFile = fallbackPath.split(/[/\\]/).pop();
            }
        }

        if (!routerImportPath || !routerFile) {
            console.log('[CookieCloud] failed to find routes-xxx.mjs in dist, CookieCloud not load.');
            return;
        }
        console.log(`[CookieCloud] hacking ${routerFile}`);
        const routesModule = await import(pathToFileURL(routerImportPath).href);
        console.log('[CookieCloud] routes module keys:', Object.keys(routesModule || {}));
        const routes = routesModule?.default ?? routesModule?.route;
        if (!routes || typeof routes !== 'object') {
            console.log('[CookieCloud] routes module invalid, CookieCloud not load.');
            return;
        }

        routes.cookiecloud = route;

        try {
            if (!(await findSetConfigFunc())) {
                console.log('[CookieCloud] cannot hacking config-xxx.mjs, CookieCloud not load.');
                return;
            }
        } catch (error) {
            console.log('[CookieCloud] trying fallback config search because:', error?.message || error);
            console.log('[CookieCloud] scanning dist for config-xxx.mjs...');
            const configFile = await findJs('config');
            if (configFile) {
                console.log(`[CookieCloud] found config file at ${configFile}`);
                const configModule = await import(pathToFileURL(configFile).href);
                const setConfig = configModule?.setConfig ?? configModule?.default?.setConfig;
                if (typeof setConfig === 'function') {
                    console.log('[CookieCloud] invoking fallback setConfig');
                    await setConfig({});
                } else {
                    console.log('[CookieCloud] fallback config module missing setConfig, CookieCloud not load.');
                    return;
                }
            } else {
                console.log('[CookieCloud] fallback config search failed, CookieCloud not load.');
                return;
            }
        }

        setTimeout(async () => await createCookieCloudSyncJob(false), 10);
        console.log('[CookieCloud] CookieCloud loaded.');
    } catch (error) {
        console.log('[CookieCloud] CookieCloud load failed:', error);
    }
}

process.env.NODE_ENV = 'production';
process.env.NODE_OPTIONS = '--max-http-header-size=32768';

await setupCookieCloud();

import(`${CookieCloudDir}/../dist/index.mjs`);
