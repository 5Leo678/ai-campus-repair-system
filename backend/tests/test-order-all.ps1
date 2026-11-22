param(
  [string]$BaseUrl = 'http://localhost:3000',
  [Parameter(Mandatory = $true)][string]$AdminToken,
  [Parameter(Mandatory = $true)][string]$UserToken
)

$ErrorActionPreference = 'Stop'
$uri = "$($BaseUrl.TrimEnd('/'))/api/order/all?page=1&size=10&status=pending"

Write-Host 'Step 1: Admin requests the paginated, filtered order list.'
$adminResponse = Invoke-RestMethod -Uri $uri -Method Get -Headers @{
  Authorization = "Bearer $AdminToken"
}

if ($adminResponse.code -ne 200 -or
    $null -eq $adminResponse.data.list -or
    $null -eq $adminResponse.data.total -or
    $adminResponse.data.page -ne 1 -or
    $adminResponse.data.size -ne 10 -or
    $null -eq $adminResponse.data.totalPage) {
  throw "Admin request returned an unexpected response: $($adminResponse | ConvertTo-Json -Depth 8)"
}

Write-Host "PASS: code=$($adminResponse.code), total=$($adminResponse.data.total), page=$($adminResponse.data.page), size=$($adminResponse.data.size)"

Write-Host 'Step 2: A regular user is denied access with HTTP 403.'
try {
  $null = Invoke-RestMethod -Uri $uri -Method Get -Headers @{
    Authorization = "Bearer $UserToken"
  }
  throw 'FAIL: a regular user unexpectedly accessed /api/order/all.'
} catch {
  if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq 403) {
    Write-Host 'PASS: regular user received HTTP 403 Forbidden.'
  } else {
    throw
  }
}
