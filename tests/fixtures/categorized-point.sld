<StyledLayerDescriptor xmlns="http://www.opengis.net/sld" xmlns:ogc="http://www.opengis.net/ogc" version="1.0.0">
  <NamedLayer><Name>stations</Name><UserStyle><Title>Station types</Title><FeatureTypeStyle>
    <Rule><Name>primary</Name><Title>Primary station</Title><ogc:Filter><ogc:PropertyIsEqualTo><ogc:PropertyName>kind</ogc:PropertyName><ogc:Literal>primary</ogc:Literal></ogc:PropertyIsEqualTo></ogc:Filter>
      <PointSymbolizer><Graphic><Mark><WellKnownName>square</WellKnownName><Fill><CssParameter name="fill">#E63946</CssParameter><CssParameter name="fill-opacity">0.5</CssParameter></Fill><Stroke><CssParameter name="stroke">#123456</CssParameter><CssParameter name="stroke-width">2</CssParameter><CssParameter name="stroke-opacity">0.25</CssParameter></Stroke></Mark><Size>16</Size><Rotation>30</Rotation><Opacity>0.5</Opacity></Graphic></PointSymbolizer>
    </Rule>
    <Rule><Name>secondary</Name><Title>Secondary station</Title><ogc:Filter><ogc:PropertyIsEqualTo><ogc:PropertyName>kind</ogc:PropertyName><ogc:Literal>secondary</ogc:Literal></ogc:PropertyIsEqualTo></ogc:Filter>
      <PointSymbolizer><Graphic><Mark><WellKnownName>triangle</WellKnownName><Fill><CssParameter name="fill">#2A9D8F</CssParameter></Fill></Mark><Size>12</Size></Graphic></PointSymbolizer>
    </Rule>
    <Rule><Name>unused</Name><ogc:Filter><ogc:PropertyIsEqualTo><ogc:PropertyName>kind</ogc:PropertyName><ogc:Literal>unused</ogc:Literal></ogc:PropertyIsEqualTo></ogc:Filter>
      <PointSymbolizer><Graphic><Mark><WellKnownName>star</WellKnownName><Fill/></Mark><Size>10</Size></Graphic></PointSymbolizer>
    </Rule>
  </FeatureTypeStyle></UserStyle></NamedLayer>
</StyledLayerDescriptor>
