var data = require('../flow-summary.json')
var keys = ['saudi_arabia_crude','saudi_arabia_lng','saudi_arabia_lpg','uae_crude','uae_lng','uae_lpg','qatar_crude','qatar_lng','qatar_lpg','oman_crude','oman_lng','oman_lpg','russia_crude','russia_lng','russia_lpg','australia_crude','australia_lng','australia_lpg','us_crude','us_lng','us_lpg']
keys.forEach(function(k) {
  var d = data[k]
  if(!d) return console.log(k + ': NOT FOUND')
  console.log(k + ' (' + d.direction + ', ' + d.unit + ')' + (d.hasPipeline ? ' PIPELINE: ' + d.pipelineNote : ''))
  d.weeks.forEach(function(w) {
    var countries = Object.keys(w.allCountries).map(function(c) { return c + ':' + Math.round(w.allCountries[c]) }).join(', ')
    console.log('  ' + w.period + ' total=' + w.total + ' gulf=' + w.gulfTotal + '(' + w.gulfShare + '%) ' + (countries || 'no dest'))
  })
})
