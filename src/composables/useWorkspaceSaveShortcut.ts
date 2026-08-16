type SaveShortcutOptions = {
  canSave: () => boolean
  save: () => void | Promise<void>
}

export function isWorkspaceSaveShortcut(event: KeyboardEvent) {
  return (event.ctrlKey || event.metaKey)
    && !event.altKey
    && event.key.toLowerCase() === 's'
}

export function handleWorkspaceSaveShortcut(event: KeyboardEvent, options: SaveShortcutOptions) {
  if (!isWorkspaceSaveShortcut(event) || !options.canSave()) return false
  event.preventDefault()
  void options.save()
  return true
}
