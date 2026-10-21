<s:StyledLayerDescriptor xmlns:s="http://www.opengis.net/sld" xmlns:f="http://www.opengis.net/ogc" version="1.0.0">
  <s:UserLayer><s:Name>routes</s:Name><s:UserStyle><s:Title>Route types</s:Title><s:FeatureTypeStyle>
    <s:Rule><s:Name>primary</s:Name><s:Title>Primary route</s:Title><f:Filter><f:PropertyIsEqualTo><f:PropertyName>kind</f:PropertyName><f:Literal>primary</f:Literal></f:PropertyIsEqualTo></f:Filter>
      <s:LineSymbolizer><s:Stroke><s:CssParameter name="stroke">#123456</s:CssParameter><s:CssParameter name="stroke-width">6</s:CssParameter><s:CssParameter name="stroke-opacity">0.5</s:CssParameter><s:CssParameter name="stroke-linecap">butt</s:CssParameter><s:CssParameter name="stroke-linejoin">mitre</s:CssParameter></s:Stroke></s:LineSymbolizer>
      <s:LineSymbolizer><s:Stroke><s:CssParameter name="stroke">#E63946</s:CssParameter><s:CssParameter name="stroke-width">2</s:CssParameter><s:CssParameter name="stroke-dasharray">5 3</s:CssParameter><s:CssParameter name="stroke-linecap">round</s:CssParameter><s:CssParameter name="stroke-linejoin">bevel</s:CssParameter></s:Stroke></s:LineSymbolizer>
    </s:Rule>
    <s:Rule><s:Name>secondary</s:Name><s:Title>Secondary route</s:Title><f:Filter><f:PropertyIsEqualTo><f:PropertyName>kind</f:PropertyName><f:Literal>secondary</f:Literal></f:PropertyIsEqualTo></f:Filter>
      <s:LineSymbolizer><s:Stroke><s:CssParameter name="stroke">#2A9D8F</s:CssParameter><s:CssParameter name="stroke-width">3</s:CssParameter><s:CssParameter name="stroke-dasharray">2 4 1</s:CssParameter><s:CssParameter name="stroke-linecap">square</s:CssParameter><s:CssParameter name="stroke-linejoin">round</s:CssParameter></s:Stroke></s:LineSymbolizer>
    </s:Rule>
  </s:FeatureTypeStyle></s:UserStyle></s:UserLayer>
</s:StyledLayerDescriptor>
