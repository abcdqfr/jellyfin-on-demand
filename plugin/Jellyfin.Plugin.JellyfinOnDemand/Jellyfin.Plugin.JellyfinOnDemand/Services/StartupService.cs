using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using MediaBrowser.Model.Tasks;

namespace Jellyfin.Plugin.JellyfinOnDemand.Services
{
    public class StartupService : IScheduledTask
    {
        private readonly Logger _logger;

        public string Name => "Jellyfin Enhanced Startup";
        public string Key => "JellyfinEnhancedStartup";
        public string Description => "Initializes Jellyfin Enhanced background services and performs necessary cleanups. The client script is injected at request time by the injection middleware.";
        public string Category => "Jellyfin Enhanced";

        public StartupService(Logger logger)
        {
            _logger = logger;
        }

        public async Task ExecuteAsync(IProgress<double> progress, CancellationToken cancellationToken)
        {
            await Task.Run(() =>
            {
                _logger.Info("Jellyfin Enhanced Startup Task run successfully.");
                EnsureScriptInjected();
                // Seerr/*arr monitors quarantined (ADR-004); JellyfinOnDemand uses SwarmController.
                _logger.Info("Jellyfin Enhanced Startup Task completed successfully.");
            }, cancellationToken);
        }

        // Request-time script injection (Jellyfin 10.11 & 12).
        //
        // The client <script> tag is injected into web/index.html at request time by
        // ScriptInjectionStartupFilter (and branding by BrandingAssetStartupFilter), so
        // nothing is written to the web folder on startup. The legacy on-disk index.html
        // rewrite is kept only as an explicit fallback for admins who disable the middleware.
        private void EnsureScriptInjected()
        {
            var config = JellyfinEnhanced.Instance?.Configuration;

            if (config != null && config.DisableScriptInjectionMiddleware)
            {
                _logger.Info("Script injection middleware is disabled; using the legacy on-disk index.html fallback.");
                JellyfinEnhanced.Instance?.InjectScript();
                return;
            }

            _logger.Info("Client script will be injected at request time by the injection middleware.");
        }


        public IEnumerable<TaskTriggerInfo> GetDefaultTriggers()
        {
            yield return new TaskTriggerInfo()
            {
                Type = TaskTriggerInfoType.StartupTrigger
            };
        }
    }
}
