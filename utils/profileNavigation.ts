// Build the URL parser from the same access state as the registered native screens.
export function profileNavigationScreens(screens: Record<string, any>, signedIn: boolean, selectedProfile: boolean, admin: boolean) {
  const active = { ...screens };
  if (!signedIn || !selectedProfile) {
    for (const key of ['Principal', 'Admin', 'Apariencia', 'Descargas']) delete active[key];
    if (signedIn) { delete active.Ingreso; delete active.Registro; } else delete active.SeleccionPerfil;
  } else {
    delete active.Ingreso; delete active.Registro; delete active.SeleccionPerfil;
    if (!admin) delete active.Admin;
  }
  return active;
}
