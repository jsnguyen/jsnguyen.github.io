regex_date = %r{^\d{4}\-(0?[1-9]|1[012])\-(0?[1-9]|[12][0-9]|3[01])$}

PHOTOS_DIR = '../assets/photos/photography'
POSTS_DIR = '../_photography'
PHOTOS_EXT = '.jpg'
POSTS_EXT = '.md'

Dir.glob(File.join(PHOTOS_DIR+'/*.jpg')) do |filename|
  puts 'FILENAME: ',filename

  name = File.basename(filename.chomp(PHOTOS_EXT))

  post_filename = name+POSTS_EXT

  puts 'name: ',name
  puts 'filename: ',filename
  puts 'post_filename: ',post_filename

  puts File.join(POSTS_DIR,post_filename)
  File.open(File.join(POSTS_DIR,post_filename),'w') do |pf|
    pf.puts '---'
    pf.puts 'layout: photo'
    pf.puts 'title: '+name
    pf.puts 'photo: '+filename
    pf.puts '---'
    pf.puts
    pf.puts 'No description.'
  end
  
 end
