param([string]$ProjectRef='hhilrnacqfxjcvrwnzcx')
$ErrorActionPreference='Stop'
if ($ProjectRef -notmatch '^[a-z0-9]+$') { throw 'Invalid Supabase project reference.' }
$projectRoot=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
Push-Location -LiteralPath $projectRoot
try {
  npx supabase@latest login
  if ($LASTEXITCODE -ne 0) { throw 'Supabase login failed.' }
  $secretFile=Join-Path $projectRoot '.env.push'
  if (Test-Path -LiteralPath $secretFile) {
    $secretLine=Get-Content -LiteralPath $secretFile | Where-Object { $_ -match '^PUSH_WEBHOOK_SECRET=' } | Select-Object -First 1
    if (-not $secretLine) { throw 'The existing .env.push file is missing PUSH_WEBHOOK_SECRET.' }
    $pushSecret=$secretLine.Substring('PUSH_WEBHOOK_SECRET='.Length)
  } else {
    $pushSecret=[Guid]::NewGuid().ToString('N')+[Guid]::NewGuid().ToString('N')
    Set-Content -LiteralPath $secretFile -Value ('PUSH_WEBHOOK_SECRET='+$pushSecret) -Encoding ascii
  }
  if ($pushSecret -notmatch '^[a-f0-9]{64}$') { throw 'Unexpected push secret format.' }
  npx supabase@latest secrets set --project-ref $ProjectRef --env-file $secretFile
  if ($LASTEXITCODE -ne 0) { throw 'Supabase secret setup failed.' }
  npx supabase@latest functions deploy push-challenges --project-ref $ProjectRef --no-verify-jwt --use-api
  if ($LASTEXITCODE -ne 0) { throw 'Push function deployment failed.' }
  $migration=Get-Content -LiteralPath (Join-Path $projectRoot 'supabase\migrations\202610060003_push_and_joiner_first.sql') -Raw
  $activation=Get-Content -LiteralPath (Join-Path $projectRoot 'supabase\push-activation.sql') -Raw
  $activation=$activation.Replace('__PROJECT_REF__',$ProjectRef).Replace('__PUSH_SECRET__',$pushSecret)
  $sqlPath=Join-Path $projectRoot '.push-setup.sql'
  Set-Content -LiteralPath $sqlPath -Value ($migration+[Environment]::NewLine+$activation) -Encoding utf8
  Write-Output "Push function deployed. Open $sqlPath and paste all its contents into the Supabase SQL Editor, then run it."
  Write-Output 'This local SQL contains your webhook secret. It and .env.push are excluded from Git. Keep them private.'
} finally { Pop-Location }
