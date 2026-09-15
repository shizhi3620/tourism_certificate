import Foundation
import PDFKit
import CoreGraphics
import ImageIO

guard CommandLine.arguments.count == 3 else {
  fputs("Usage: render-pdf-pages.swift input.pdf output-directory\n", stderr)
  exit(1)
}

let inputURL = URL(fileURLWithPath: CommandLine.arguments[1])
let outputURL = URL(fileURLWithPath: CommandLine.arguments[2])
try FileManager.default.createDirectory(at: outputURL, withIntermediateDirectories: true)
guard let document = PDFDocument(url: inputURL) else {
  fputs("Unable to open PDF\n", stderr)
  exit(1)
}

for index in 0..<document.pageCount {
  guard let page = document.page(at: index) else { continue }
  let bounds = page.bounds(for: .mediaBox)
  let scale: CGFloat = 2.0
  let size = CGSize(width: max(bounds.width * scale, 1), height: max(bounds.height * scale, 1))
  let colorSpace = CGColorSpaceCreateDeviceRGB()
  guard let context = CGContext(
    data: nil,
    width: Int(size.width),
    height: Int(size.height),
    bitsPerComponent: 8,
    bytesPerRow: 0,
    space: colorSpace,
    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
  ) else { continue }
  context.setFillColor(CGColor(gray: 1, alpha: 1))
  context.fill(CGRect(origin: .zero, size: size))
  context.saveGState()
  context.scaleBy(x: scale, y: scale)
  page.draw(with: .mediaBox, to: context)
  context.restoreGState()
  guard let image = context.makeImage() else { continue }
  let destination = outputURL.appendingPathComponent(String(format: "page-%04d.png", index + 1))
  guard let destinationRef = CGImageDestinationCreateWithURL(
    destination as CFURL,
    "public.png" as CFString,
    1,
    nil
  ) else { continue }
  CGImageDestinationAddImage(destinationRef, image, nil)
  CGImageDestinationFinalize(destinationRef)
  print(destination.path)
}
