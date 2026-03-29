var data = require('../flow-summary.json')
var keys = ['kuwait_gasoil_diesel','kuwait_gasoline','kuwait_naphtha','kuwait_sulphur',
'oman_kero_jet','oman_gasoil_diesel','oman_gasoline','oman_naphtha','oman_sulphur',
'qatar_kero_jet','qatar_gasoil_diesel','qatar_gasoline','qatar_naphtha','qatar_sulphur',
'russia_kero_jet','russia_gasoil_diesel','russia_gasoline','russia_naphtha','russia_sulphur',
'saudi_arabia_kero_jet','saudi_arabia_gasoil_diesel','saudi_arabia_gasoline','saudi_arabia_naphtha','saudi_arabia_sulphur',
'uae_kero_jet','uae_gasoil_diesel','uae_gasoline','uae_naphtha','uae_sulphur',
'us_kero_jet','us_gasoil_diesel','us_gasoline','us_naphtha','us_sulphur',
'australia_kero_jet','australia_gasoil_diesel','australia_gasoline','australia_naphtha','australia_sulphur']
keys.forEach(function(k) {
  var d = data[k]
  if(!d) return
  console.log(k + ': W10=' + d.weeks[0].total + ' W11=' + d.weeks[1].total + ' W12=' + d.weeks[2].total + ' W13=' + d.weeks[3].total + ' (' + d.unit + ')')
})
