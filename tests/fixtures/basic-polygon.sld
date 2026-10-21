<?xml version="1.0" encoding="UTF-8"?>
<StyledLayerDescriptor xmlns="http://www.opengis.net/sld" xmlns:f="http://www.opengis.net/ogc" version="1.0.0">
  <NamedLayer><Name>Example</Name><UserStyle><Title>Land classes</Title><FeatureTypeStyle>
    <Rule><Name>water</Name><Title>Open water</Title><f:Filter><f:PropertyIsEqualTo><f:PropertyName>kind</f:PropertyName><f:Literal>Water</f:Literal></f:PropertyIsEqualTo></f:Filter><PolygonSymbolizer><Fill><CssParameter name="fill">#123456</CssParameter><CssParameter name="fill-opacity">0.5</CssParameter></Fill><Stroke><CssParameter name="stroke">#ABCDEF</CssParameter><CssParameter name="stroke-width">2.5</CssParameter><CssParameter name="stroke-opacity">0.25</CssParameter></Stroke></PolygonSymbolizer></Rule>
    <Rule><Name>Woodland</Name><f:Filter><f:PropertyIsEqualTo><f:PropertyName>kind</f:PropertyName><f:Literal>Forest</f:Literal></f:PropertyIsEqualTo></f:Filter><PolygonSymbolizer><Fill><CssParameter name="fill">#0A0</CssParameter></Fill></PolygonSymbolizer></Rule>
  </FeatureTypeStyle></UserStyle></NamedLayer>
</StyledLayerDescriptor>
