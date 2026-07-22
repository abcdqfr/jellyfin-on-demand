using Jellyfin.Plugin.JellyfinOnDemand.Model.Jellyseerr;

namespace Jellyfin.Plugin.JellyfinOnDemand.Helpers.Jellyseerr
{
    public static class JellyseerrPermissionHelper
    {
        public static bool HasPermission(JellyseerrPermission userPermissions, JellyseerrPermission permissionToCheck)
        {
            if (permissionToCheck == JellyseerrPermission.NONE) return false;
            return (userPermissions & permissionToCheck) == permissionToCheck;
        }

        public static bool HasAnyPermission(JellyseerrPermission userPermissions, JellyseerrPermission permissionsToCheck)
        {
            if (permissionsToCheck == JellyseerrPermission.NONE) return false;
            return (userPermissions & permissionsToCheck) != 0;
        }
    }
}
