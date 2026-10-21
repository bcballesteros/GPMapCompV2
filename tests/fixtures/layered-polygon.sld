<StyledLayerDescriptor xmlns="http://www.opengis.net/sld" xmlns:ogc="http://www.opengis.net/ogc" version="1.0.0">
  <NamedLayer><Name>Synthetic patterns</Name><UserStyle><Title>Layered polygons</Title><FeatureTypeStyle>
    <FeatureTypeName>Feature</FeatureTypeName>
    <Rule><Name>hatch-rule</Name><Title>Hatched water</Title>
      <ogc:Filter><ogc:PropertyIsEqualTo><ogc:PropertyName>kind</ogc:PropertyName><ogc:Literal>Water</ogc:Literal></ogc:PropertyIsEqualTo></ogc:Filter>
      <PolygonSymbolizer><Fill><CssParameter name="fill">#AFC8E1</CssParameter></Fill>
        <Stroke><CssParameter name="stroke">#334455</CssParameter><CssParameter name="stroke-width">2</CssParameter><CssParameter name="stroke-opacity">0.5</CssParameter></Stroke>
      </PolygonSymbolizer>
      <PolygonSymbolizer><Fill><GraphicFill><Graphic><Mark><WellKnownName>hatch</WellKnownName>
        <Fill><CssParameter name="fill">#FF6600</CssParameter><CssParameter name="fill-opacity">0.4</CssParameter></Fill>
        <Stroke><CssParameter name="stroke">#112233</CssParameter><CssParameter name="stroke-width">1.5</CssParameter><CssParameter name="stroke-opacity">0.6</CssParameter></Stroke>
        </Mark><Opacity>0.5</Opacity><Size>12</Size><Rotation>30</Rotation></Graphic></GraphicFill>
        <CssParameter name="fill">#FF0000</CssParameter><CssParameter name="fill-opacity">0.8</CssParameter>
      </Fill></PolygonSymbolizer>
    </Rule>
    <Rule><Name>times-rule</Name><Title>Crossed forest</Title>
      <ogc:Filter><ogc:PropertyIsEqualTo><ogc:PropertyName>kind</ogc:PropertyName><ogc:Literal>Forest</ogc:Literal></ogc:PropertyIsEqualTo></ogc:Filter>
      <PolygonSymbolizer><Fill><CssParameter name="fill">#FFFF00</CssParameter></Fill></PolygonSymbolizer>
      <PolygonSymbolizer><Fill><GraphicFill><Graphic><Mark><WellKnownName>shape://times</WellKnownName>
        <Stroke><CssParameter name="stroke">#000099</CssParameter><CssParameter name="stroke-width">1.2</CssParameter></Stroke>
        </Mark><Size>10</Size><Rotation>0</Rotation></Graphic></GraphicFill></Fill></PolygonSymbolizer>
    </Rule>
  </FeatureTypeStyle></UserStyle></NamedLayer>
</StyledLayerDescriptor>
