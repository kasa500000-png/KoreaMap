import com.onthegomap.planetiler.VectorTile;
import java.io.ByteArrayInputStream;
import java.nio.file.Path;
import java.sql.DriverManager;
import java.util.HashSet;
import java.util.Set;
import java.util.zip.GZIPInputStream;
import org.locationtech.jts.geom.Geometry;
import org.locationtech.jts.geom.Polygon;

/** Decodes the actual MBTiles produced from the authored PBF; no source/renderer mocks. */
public final class KoreaArchiveTest {
  private static void require(boolean condition, String label) {
    if (!condition) throw new AssertionError(label);
  }
  private static boolean hasHole(Geometry geometry) {
    if (geometry instanceof Polygon polygon) return polygon.getNumInteriorRing() > 0;
    if (geometry.getNumGeometries() > 1) {
      for (int i = 0; i < geometry.getNumGeometries(); i++)
        if (hasHole(geometry.getGeometryN(i))) return true;
    }
    return false;
  }
  public static void main(String[] args) throws Exception {
    if (args.length != 1) throw new IllegalArgumentException("Pass the authored fixture MBTiles path");
    String uri = "jdbc:sqlite:" + Path.of(args[0]).toAbsolutePath().toUri() + "?mode=ro";
    var kinds = new HashSet<String>();
    var roadClasses = new HashSet<String>();
    var allowed = Set.of("kind", "class", "poi", "name:ko", "name", "name:en");
    boolean korean = false, english = false, waterHole = false, parking = false;
    int tiles = 0, features = 0;
    try (var connection = DriverManager.getConnection(uri);
         var query = connection.createStatement()) {
      try (var metadata = query.executeQuery("SELECT value FROM metadata WHERE name='attribution'")) {
        require(metadata.next(), "attribution metadata exists");
        require(metadata.getString(1).contains("OpenStreetMap") && metadata.getString(1).contains("ODbL"), "ODbL attribution retained");
      }
      try (var result = query.executeQuery("SELECT zoom_level,tile_data FROM tiles")) {
        while (result.next()) {
          tiles++;
          int zoom = result.getInt(1);
          require(zoom >= 0 && zoom <= 14, "zoom within pipeline contract");
          byte[] raw = result.getBytes(2);
          if (raw.length > 2 && (raw[0] & 255) == 31 && (raw[1] & 255) == 139) {
            try (var gzip = new GZIPInputStream(new ByteArrayInputStream(raw))) {
              raw = gzip.readNBytes(8 * 1024 * 1024 + 1);
            }
          }
          require(raw.length <= 8 * 1024 * 1024, "bounded tile decoding");
          for (var feature : VectorTile.decode(raw)) {
            features++;
            require(KoreaProfile.LAYERS.contains(feature.layer()), "known source-layer");
            require(feature.layer().equals(feature.tags().get("kind")), "kind matches source-layer");
            require(allowed.containsAll(feature.tags().keySet()), "only public schema properties");
            kinds.add(feature.layer());
            if (feature.layer().equals("road")) roadClasses.add((String) feature.tags().get("class"));
            korean |= "합성시".equals(feature.tags().get("name:ko"));
            english |= "Authored City English".equals(feature.tags().get("name:en"));
            parking |= "parking".equals(feature.tags().get("poi"));
            if (feature.layer().equals("water")) waterHole |= hasHole(feature.geometry().decode());
          }
        }
      }
    }
    require(kinds.equals(KoreaProfile.LAYERS), "all nine style source-layers emitted from real PBF");
    require(roadClasses.equals(Set.of("major", "minor")), "both road classes emitted");
    require(korean && english, "Korean and fallback names survive PBF to MVT");
    require(parking, "POI icon category survives PBF to MVT");
    require(waterHole, "OSM multipolygon inner ring survives relation assembly to MVT");
    System.out.println("PASS KoreaArchive: " + tiles + " tiles / " + features + " decoded features / nine layers / multipolygon hole");
  }
}
