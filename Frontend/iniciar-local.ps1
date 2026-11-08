$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add('http://127.0.0.1:8765/')
$listener.Start()
Write-Host 'Método Judicial disponible en http://127.0.0.1:8765/ (Ctrl+C para cerrar)'
$mime = @{ '.html'='text/html; charset=utf-8'; '.js'='text/javascript; charset=utf-8'; '.css'='text/css; charset=utf-8'; '.svg'='image/svg+xml'; '.png'='image/png'; '.webp'='image/webp'; '.pdf'='application/pdf' }
try {
  while ($listener.IsListening) {
    $context = $listener.GetContext()
    try {
      $relative = [Uri]::UnescapeDataString($context.Request.Url.AbsolutePath.TrimStart('/')).Replace('/', [IO.Path]::DirectorySeparatorChar)
      if ([string]::IsNullOrWhiteSpace($relative)) { $relative = 'index.html' }
      $file = [IO.Path]::GetFullPath((Join-Path $root $relative))
      if (-not $file.StartsWith($root, [StringComparison]::OrdinalIgnoreCase)) { $context.Response.StatusCode = 403; continue }
      if (Test-Path -LiteralPath $file -PathType Container) { $file = Join-Path $file 'index.html' }
      if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { $context.Response.StatusCode = 404; continue }
      $context.Response.ContentType = $mime[[IO.Path]::GetExtension($file).ToLowerInvariant()]
      if (-not $context.Response.ContentType) { $context.Response.ContentType = 'application/octet-stream' }
      $bytes = [IO.File]::ReadAllBytes($file)
      $context.Response.ContentLength64 = $bytes.Length
      $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } finally { $context.Response.Close() }
  }
} finally { $listener.Stop(); $listener.Close() }
