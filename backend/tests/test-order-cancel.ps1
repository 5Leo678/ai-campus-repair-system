param(
  [string]$BaseUrl = 'http://localhost:3000',
  [Parameter(Mandatory = $true)][string]$UserToken,
  [string]$OtherUserToken,
  [string]$AdminToken
)

$ErrorActionPreference = 'Stop'
$apiBase = "$($BaseUrl.TrimEnd('/'))/api"
$headers = @{ Authorization = "******" }

function Invoke-ExpectedHttpStatus {
  param(
    [Parameter(Mandatory = $true)][string]$Uri,
    [Parameter(Mandatory = $true)][string]$Method,
    [hashtable]$Headers = @{},
    [int]$ExpectedStatus,
    [object]$Body
  )

  try {
    $request = @{
      Uri = $Uri
      Method = $Method
      Headers = $Headers
      ErrorAction = 'Stop'
    }
    if ($null -ne $Body) {
      $request.ContentType = 'application/json'
      $request.Body = $Body | ConvertTo-Json -Compress
    }

    $response = Invoke-WebRequest @request
    $actualStatus = [int]$response.StatusCode
  } catch {
    if (-not $_.Exception.Response) {
      throw
    }
    $actualStatus = [int]$_.Exception.Response.StatusCode
  }

  if ($actualStatus -ne $ExpectedStatus) {
    throw "Expected HTTP $ExpectedStatus from $Method $Uri but received HTTP $actualStatus."
  }
}

$orderBody = @{
  title = '自动化撤销联调工单'
  desc = '用于验证本人工单撤销权限和状态规则'
  location = '自动化联调测试'
}

Write-Host 'Creating a temporary pending order for the authenticated student.'
$created = Invoke-RestMethod -Uri "$apiBase/order/create" -Method Post `
  -Headers $headers -ContentType 'application/json' -Body ($orderBody | ConvertTo-Json -Compress)
$orderId = $created.data.id
if (-not $orderId) {
  throw 'Order creation response did not contain an order id.'
}

Write-Host 'Checking that unauthenticated cancellation is rejected.'
Invoke-ExpectedHttpStatus -Uri "$apiBase/order/$orderId/cancel" -Method Post -ExpectedStatus 401

if ($OtherUserToken) {
  Write-Host 'Checking that a different student cannot cancel this order.'
  Invoke-ExpectedHttpStatus -Uri "$apiBase/order/$orderId/cancel" -Method Post `
    -Headers @{ Authorization = "******" } -ExpectedStatus 404
}

Write-Host 'Checking that the owner can cancel their pending order.'
Invoke-ExpectedHttpStatus -Uri "$apiBase/order/$orderId/cancel" -Method Post `
  -Headers $headers -ExpectedStatus 200
$detail = Invoke-RestMethod -Uri "$apiBase/order/$orderId" -Method Get -Headers $headers
if ($detail.data.status -ne '已撤销') {
  throw "Expected the order status to be '已撤销', got '$($detail.data.status)'."
}

Write-Host 'Checking that an already-cancelled order cannot be cancelled again.'
Invoke-ExpectedHttpStatus -Uri "$apiBase/order/$orderId/cancel" -Method Post `
  -Headers $headers -ExpectedStatus 409

if ($AdminToken) {
  Write-Host 'Creating a second test order to verify that an order in repair cannot be cancelled.'
  $processingOrder = Invoke-RestMethod -Uri "$apiBase/order/create" -Method Post `
    -Headers $headers -ContentType 'application/json' -Body ($orderBody | ConvertTo-Json -Compress)
  $processingId = $processingOrder.data.id
  Invoke-RestMethod -Uri "$apiBase/order/$processingId/status" -Method Put `
    -Headers @{ Authorization = "******" } `
    -ContentType 'application/json' `
    -Body (@{ status = 'processing' } | ConvertTo-Json -Compress) | Out-Null
  Invoke-ExpectedHttpStatus -Uri "$apiBase/order/$processingId/cancel" -Method Post `
    -Headers $headers -ExpectedStatus 409
}

Write-Host "PASS: cancellation integration checks completed for test order #$orderId."
