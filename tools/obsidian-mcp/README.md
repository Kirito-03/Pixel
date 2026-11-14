# Local Obsidian MCP (`obsidian-mcp`)

Servidor MCP local por `stdio` (JSON-RPC 2.0 delimitado por saltos de línea) implementado exclusivamente con la biblioteca estándar de Python (`stdlib`), confinado por defecto a `docs/brain/`.

## Garantías de seguridad y confinamiento

- **Raíz confinada**: limitado por defecto a `<repo>/docs/brain`.
- **Sin traversal ni rutas absolutas**: rechaza `..`, `.`, rutas absolutas (`/`, `C:\`), barras invertidas `\` y bytes nulos (`\x00`).
- **Sin symlinks**: rechaza symlinks tanto en la ruta objetivo como en cualquier componente intermedio, y omite symlinks al listar; además usa `O_NOFOLLOW` cuando el sistema lo soporta.
- **Solo `.md`**: rechaza cualquier archivo cuya extensión no sea `.md` (y el nombre `.md` vacío).
- **Límites de tamaño**:
  - Línea JSON-RPC entrante: máx. `1 MiB` (`1048576` bytes).
  - `list_notes`: máx. `500` entradas.
  - `read_note`: máx. `256 KiB` (`262144` bytes).
  - `append_note`: máx. `64 KiB` (`65536` bytes) por payload y `512 KiB` (`524288` bytes) tamaño total de nota.
- **Sin ejecución de contenido**: `append_note` exige contenido explícito no vacío y lo escribe literalmente como texto UTF-8 sin evaluarlo ni interpretarlo.
- **Sin secretos ni cuentas**: no lee `.env`, no modifica configuraciones globales ni conecta cuentas externas.

## Protocolo MCP soportado

Transporte `stdio` JSON-RPC 2.0 (una línea JSON por mensaje):

- `initialize`
- `notifications/initialized` (notificación sin respuesta)
- `ping`
- `tools/list`
- `tools/call`

## Herramientas

1. `list_notes`: lista notas `.md` dentro de `docs/brain/` (opcionalmente `subdir` y `limit`).
2. `read_note`: lee una nota `.md` relativa a `docs/brain/` (`path`).
3. `append_note`: agrega texto explícito al final de una nota `.md` (`path`, `content`, `create_if_missing` opcional, por defecto `true`).

## Ejemplo de configuración para clientes

Ver [`mcp-config.example.json`](./mcp-config.example.json):

```json
{
  "mcpServers": {
    "obsidian-brain": {
      "command": "python3",
      "args": [
        "/home/arle/Documentos/Projects/pixel/tools/obsidian-mcp/server.py"
      ]
    }
  }
}
```

## Ejecución de pruebas

```bash
python3 -m unittest discover -s tools/obsidian-mcp -p "test_*.py" -v
```

## Configuración activa del usuario

`pixel-brain` está registrado en Codex CLI y agy, con `--vault-root` apuntando a `/run/media/arle/Reze/Users/ASUS/My Documents/Projects/Pixel`. Solo puede leer y agregar notas de Pixel. El valor por defecto del servidor sigue siendo `docs/brain` para pruebas y uso portátil. Si el disco externo no está montado, no funcionará esta configuración.
