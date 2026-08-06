/**
 * Estilo escuro do mapa (Android / Maps SDK).
 *
 * Entrega de GLP tem forte volume noturno, e mapa branco na cara de quem está
 * de moto ofusca e destrói a visão adaptada ao escuro — é segurança, não
 * estética. No iOS o MapKit acompanha a aparência do sistema sozinho, então
 * este estilo só é aplicado no Android.
 *
 * A via da rota fica propositalmente mais clara que o entorno: com pouca luz
 * ambiente, o contraste do traço azul sobre asfalto escuro é o que sustenta a
 * leitura em movimento.
 */
export const DARK_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#212121' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#c9c9c9' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#212121' }] },
  {
    featureType: 'administrative.land_parcel',
    stylers: [{ visibility: 'off' }],
  },
  {
    featureType: 'poi',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#9e9e9e' }],
  },
  {
    featureType: 'poi.park',
    elementType: 'geometry',
    stylers: [{ color: '#1b1b1b' }],
  },
  { featureType: 'road', elementType: 'geometry.fill', stylers: [{ color: '#3c3c3c' }] },
  {
    featureType: 'road',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#b3b3b3' }],
  },
  {
    featureType: 'road.arterial',
    elementType: 'geometry',
    stylers: [{ color: '#454545' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry',
    stylers: [{ color: '#4e4e4e' }],
  },
  {
    featureType: 'road.local',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#9c9c9c' }],
  },
  { featureType: 'transit', elementType: 'labels.text.fill', stylers: [{ color: '#8a8a8a' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0e1626' }] },
  {
    featureType: 'water',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#4e6d92' }],
  },
];
